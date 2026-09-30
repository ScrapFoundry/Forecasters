import "server-only";
import { getSupabase } from "@/lib/supabase/server";
import { hasGenerator, serverConfig } from "@/lib/config/server";
import { tokenConfig } from "@/lib/config/token";
import { getOracleRequest } from "@/lib/imd/client";
import { getJobDetail, getJobFiles, readArtifact } from "@/lib/imd/paid";
import { generateQuestions, type GeneratedQuestion } from "./generator";
import { attribute, conditionInput, forecastJobInputs, outcomeFromOracle, planFromOracle, resolutionInput, type ForecastJobShape, type ParsedPrediction, type PipelineForecast } from "./imdjobs";
import { canPay, isPaused, latestOrder, ordersFor, paidAction, refreshOrder } from "./orders";

/**
 * FORECAST PIPELINE (state machine, driven by /api/cron/tick)
 *
 *   draft ──approve──► queued ──pay job.open──► forecasting ──job done──► collected
 *                                                                           │ deadline
 *   resolved ◄──attested── resolving ◄──pay oracle.request─────────────────┘
 *
 *   void   : no usable predictions, unresolvable answer, or operator decision
 *   failed : repeated IMD failures (operator can requeue)
 *
 * Each tick does a bounded amount of work so it fits a serverless request.
 */

export type PipelineState = "draft" | "queued" | "forecasting" | "collected" | "resolving" | "resolved" | "void" | "failed";

export interface ForecastRow extends PipelineForecast {
  category: string;
  source: string;
  resolution_method: string;
  status: string;
  generated_by: string;
  pipeline_state: PipelineState;
  forecast_job_id: string | null;
  oracle_request_id: string | null;
  condition_request_id: string | null;
  attempts: number;
  last_error: string | null;
  updated_at: string;
}

const MAX_ATTEMPTS = 2;
/** Automatic question generation waits for the token CA (set LAUNCH_REQUIRES_CA=false to disable the gate). */
const LAUNCH_REQUIRES_CA = process.env.LAUNCH_REQUIRES_CA !== "false";
/** Wait after the deadline before asking the oracle, so the outcome is public (e.g. a daily close). Grows per retry. */
export const RESOLVE_DELAY_MS = Number(process.env.RESOLVE_DELAY_HOURS || 2) * 3_600_000;
export const resolveDueAt = (f: { deadline: string; attempts: number }) => Date.parse(f.deadline) + RESOLVE_DELAY_MS * (1 + f.attempts);
const JOB_SHAPE: ForecastJobShape = process.env.FORECAST_JOB_SHAPE === "single" ? "single" : process.env.FORECAST_JOB_SHAPE === "panel" ? "panel" : "chain";

function db() {
  const d = getSupabase();
  if (!d) throw new Error("Supabase is required for the pipeline");
  return d;
}

async function patch(id: string, p: Partial<ForecastRow>): Promise<void> {
  await db().from("forecasts").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
}

async function byState(state: PipelineState, limit = 5): Promise<ForecastRow[]> {
  const { data } = await db().from("forecasts").select("*").eq("pipeline_state", state).order("deadline", { ascending: true }).limit(limit);
  return (data as ForecastRow[] | null) ?? [];
}

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export interface NewForecast {
  question: string;
  category: string;
  deadline: string;
  resolutionCriteria: string;
  oracleQuestion: string;
  source: string;
  generatedBy: string;
  draft: boolean;
  /** Snowmoon ch.27: 2 or 3 plans, plus the oracle question that tells which one happened */
  scenarios?: string[] | null;
  conditionQuestion?: string | null;
}

export async function createForecast(n: NewForecast): Promise<ForecastRow> {
  const { data, error } = await db()
    .from("forecasts")
    .insert({
      question: n.question,
      category: n.category,
      source: n.source,
      resolution_method: "IMD ORACLE",
      deadline: n.deadline,
      status: n.draft ? "DRAFT" : "OPEN",
      pipeline_state: n.draft ? "draft" : "queued",
      oracle_question: n.oracleQuestion,
      resolution_criteria: n.resolutionCriteria,
      generated_by: n.generatedBy,
      scenarios: n.scenarios?.length ? n.scenarios : null,
      condition_question: n.scenarios?.length ? n.conditionQuestion ?? null : null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return data as ForecastRow;
}

export const fromGenerated = (q: GeneratedQuestion, model: string, draft: boolean, now = Date.now()): NewForecast => ({
  question: q.question,
  category: q.category,
  deadline: new Date(now + q.deadlineHours * 3_600_000).toISOString(),
  resolutionCriteria: q.resolutionCriteria,
  oracleQuestion: q.oracleQuestion,
  source: q.source,
  generatedBy: `openai:${model}`,
  draft,
  scenarios: q.scenarios?.length ? q.scenarios : null,
  conditionQuestion: q.conditionQuestion || null,
});

export async function recentQuestions(limit = 80): Promise<string[]> {
  const { data } = await db().from("forecasts").select("question").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []).map((r) => String(r.question));
}

export async function generatedToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await db()
    .from("forecasts")
    .select("id", { count: "exact", head: true })
    .like("generated_by", "openai:%")
    .gte("created_at", start.toISOString());
  return count ?? 0;
}

export async function decisionsGeneratedToday(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count } = await db()
    .from("forecasts")
    .select("id", { count: "exact", head: true })
    .like("generated_by", "openai:%")
    .not("scenarios", "is", null)
    .gte("created_at", start.toISOString());
  return count ?? 0;
}

export async function approveDraft(id: string): Promise<void> {
  await db().from("forecasts").update({ status: "OPEN", pipeline_state: "queued", updated_at: new Date().toISOString() }).eq("id", id).eq("pipeline_state", "draft");
}

export async function voidForecast(id: string, reason: string): Promise<void> {
  await patch(id, { status: "VOID", pipeline_state: "void", last_error: reason });
}

export async function requeue(id: string): Promise<void> {
  await patch(id, { pipeline_state: "queued", attempts: 0, last_error: null });
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

export async function dispatchForecast(f: ForecastRow, log: string[]): Promise<void> {
  if (Date.parse(f.deadline) - Date.now() < 6 * 3_600_000) {
    await voidForecast(f.id, "less than 6h to deadline before forecasters were dispatched");
    log.push(`#${f.number} void: too close to deadline`);
    return;
  }
  const bodies = forecastJobInputs(f, serverConfig.forecastPanel, JOB_SHAPE);
  let paid = 0;
  let lastError: string | null = null;
  for (const body of bodies) {
    const order = await paidAction("job.open", "forecast", f.id, body);
    if (order.status === "failed") {
      lastError = order.error;
      break; // stop spending on this question after the first failure
    }
    paid += 1;
  }
  if (paid === 0) {
    const attempts = f.attempts + 1;
    await patch(f.id, { attempts, last_error: lastError, pipeline_state: attempts >= MAX_ATTEMPTS ? "failed" : "queued" });
    log.push(`#${f.number} forecast job NOT paid: ${lastError}`);
    return;
  }
  await patch(f.id, { pipeline_state: "forecasting", last_error: paid < bodies.length ? `only ${paid}/${bodies.length} jobs paid: ${lastError}` : null });
  log.push(`#${f.number} ${paid} forecast job(s) paid (${JOB_SHAPE})`);
}

export async function advanceForecasting(f: ForecastRow, log: string[]): Promise<void> {
  const orders = (await ordersFor(f.id, "forecast")).filter((o) => o.status !== "failed");
  if (orders.length === 0) {
    await patch(f.id, { pipeline_state: "queued" });
    return;
  }
  const refreshed = await Promise.all(orders.map(refreshOrder));
  const live = refreshed.filter((o) => !["payment_failed", "expired", "failed"].includes(o.status));
  if (live.length === 0) {
    const attempts = f.attempts + 1;
    await patch(f.id, { attempts, pipeline_state: attempts >= MAX_ATTEMPTS ? "failed" : "queued", last_error: `orders ${refreshed.map((o) => o.status).join(",")}` });
    log.push(`#${f.number} orders failed`);
    return;
  }
  const jobIds = live.map((o) => o.job_id).filter((x): x is string => Boolean(x));
  if (jobIds.length < live.length) {
    log.push(`#${f.number} waiting admission (${jobIds.length}/${live.length})`);
    return;
  }
  const joined = jobIds.join(",");
  if (f.forecast_job_id !== joined) await patch(f.id, { forecast_job_id: joined });

  const details = await Promise.all(jobIds.map((id) => getJobDetail(id)));
  const pending = details.filter((d) => !["completed", "blocked", "cancelled", "failed"].includes(d.state));
  if (pending.length) {
    log.push(`#${f.number} jobs ${details.map((d) => d.state).join(",")}`);
    return;
  }

  const predictions: ParsedPrediction[] = [];
  let unattributed = 0;
  const seen = new Set<string>();
  for (const detail of details.filter((d) => d.state === "completed")) {
    const result = await getJobFiles(detail.id);
    const files = await Promise.all(
      result.files.filter((x) => /\.json$/i.test(x.path)).map(async (file) => ({ file, text: await readArtifact(file.url).catch(() => "") })),
    );
    const got = attribute(detail, files, f.scenarios?.length ?? 0);
    unattributed += got.unattributed;
    const jobSeats = new Set<string>();
    for (const p of got.predictions) {
      if (seen.has(p.tokenId)) {
        // the same seat already forecast this question in another job
        if (!jobSeats.has(p.tokenId)) unattributed += 1;
        continue;
      }
      jobSeats.add(p.tokenId);
      predictions.push({ ...p, raw: { ...(p.raw as object), jobId: detail.id } });
    }
    jobSeats.forEach((t) => seen.add(t));
  }

  if (predictions.length) {
    const rows = predictions.map((p) => ({
      forecast_id: f.id,
      agent_token_id: p.tokenId,
      p_yes: p.pYes,
      scenario: p.scenario,
      rationale: p.rationale,
      source: "imd-job",
      job_id: (p.raw as { jobId?: string }).jobId ?? null,
      raw: p.raw,
      submitted_at: p.submittedAt,
    }));
    const { error } = await db().from("predictions").upsert(rows, { onConflict: "forecast_id,agent_token_id,scenario", ignoreDuplicates: true });
    if (error) log.push(`#${f.number} prediction insert: ${error.message}`);
  }
  await patch(f.id, {
    pipeline_state: predictions.length ? "collected" : "void",
    attempts: 0,
    status: predictions.length ? "OPEN" : "VOID",
    last_error: unattributed ? `${unattributed} forecast(s) could not be tied to a distinct seat` : predictions.length ? null : "jobs produced no usable forecasts",
  });
  log.push(`#${f.number} collected ${new Set(predictions.map((p) => p.tokenId)).size} forecasters${unattributed ? `, ${unattributed} unattributed` : ""}`);
}

export async function dispatchResolution(f: ForecastRow, log: string[]): Promise<void> {
  const plans = f.scenarios?.length ?? 0;
  const failed = async (err: string | null) => {
    if (err?.includes("not_answerable")) {
      // IMD screens oracle questions and refuses what public sources cannot answer yet.
      // Try again later (the delay grows per attempt); after 3 refusals the question is void.
      if (f.attempts + 1 >= 3) {
        await voidForecast(f.id, "IMD oracle refused the question as not answerable from public sources (3 attempts)");
        log.push(`#${f.number} void: IMD oracle says not answerable`);
      } else {
        await patch(f.id, { attempts: f.attempts + 1, last_error: "IMD oracle: not answerable yet, retrying later" });
        log.push(`#${f.number} oracle says not answerable yet, retry later`);
      }
      return;
    }
    const attempts = f.attempts + 1;
    await patch(f.id, { attempts, last_error: err, ...(attempts >= MAX_ATTEMPTS + 2 ? { pipeline_state: "failed" as const } : {}) });
    log.push(`#${f.number} resolution NOT paid: ${err}`);
  };
  // scenario question: first ask which plan happened (skip if already paid on a previous attempt)
  if (plans) {
    const prev = await latestOrder(f.id, "condition");
    if (!prev || ["failed", "payment_failed", "expired"].includes(prev.status)) {
      const c = await paidAction("oracle.request", "condition", f.id, conditionInput(f, serverConfig.oraclePanel, serverConfig.oracleQuorum));
      if (c.status === "failed") return failed(c.error);
      log.push(`#${f.number} which-plan oracle requested (order ${c.order_id})`);
    }
  }
  const order = await paidAction("oracle.request", "resolution", f.id, resolutionInput(f, serverConfig.oraclePanel, serverConfig.oracleQuorum));
  if (order.status === "failed") return failed(order.error);
  await patch(f.id, { pipeline_state: "resolving", attempts: 0, last_error: null });
  log.push(`#${f.number} resolution requested (order ${order.order_id})`);
}

type OracleRead =
  | { state: "waiting"; note: string }
  | { state: "failed"; note: string }
  | { state: "attested"; answer: string | null; note: string | null; panelSize: number | null; quorum: number | null; attestedAt: string | null; requestId: string };

async function readOracleOrder(f: ForecastRow, purpose: "resolution" | "condition"): Promise<OracleRead> {
  const order = await latestOrder(f.id, purpose);
  if (!order) return { state: "failed", note: `no ${purpose} order` };
  const o = await refreshOrder(order);
  if (["payment_failed", "expired", "failed"].includes(o.status)) return { state: "failed", note: `${purpose} order ${o.status}` };
  const reqId = o.oracle_request_id;
  if (!reqId) return { state: "waiting", note: `${purpose} waiting admission (${o.status})` };
  if (purpose === "resolution" && f.oracle_request_id !== reqId) await patch(f.id, { oracle_request_id: reqId });
  if (purpose === "condition" && f.condition_request_id !== reqId) await patch(f.id, { condition_request_id: reqId });
  const r = await getOracleRequest(reqId);
  if (!r.ok) return { state: "waiting", note: `${purpose} oracle read failed` };
  const req = r.data;
  if (req.status !== "attested" && !req.attestedAt) {
    return ["failed", "expired", "rejected"].includes(req.status) ? { state: "failed", note: `${purpose} oracle ${req.status}` } : { state: "waiting", note: `${purpose} oracle ${req.status}` };
  }
  return { state: "attested", answer: req.consensusAnswer, note: req.note, panelSize: req.panelSize, quorum: req.quorum, attestedAt: req.attestedAt, requestId: reqId };
}

export async function advanceResolving(f: ForecastRow, log: string[]): Promise<void> {
  const plans = f.scenarios?.length ?? 0;
  const outcomeRead = await readOracleOrder(f, "resolution");
  const conditionRead = plans ? await readOracleOrder(f, "condition") : null;

  for (const r of [outcomeRead, conditionRead]) {
    if (r?.state === "failed") {
      if (r.note.startsWith("resolution order") || r.note.startsWith("condition order") || r.note.startsWith("no ")) {
        await patch(f.id, { pipeline_state: "collected", last_error: r.note }); // unpaid: retry the paid step
      } else {
        await voidForecast(f.id, r.note);
      }
      log.push(`#${f.number} ${r.note}`);
      return;
    }
  }
  if (outcomeRead.state !== "attested" || (conditionRead && conditionRead.state !== "attested")) {
    log.push(`#${f.number} ${[outcomeRead, conditionRead].filter((x) => x && x.state === "waiting").map((x) => x!.note).join(", ")}`);
    return;
  }

  const outcome = outcomeFromOracle(outcomeRead.answer);
  if (!outcome) {
    await voidForecast(f.id, `oracle answer not boolean: ${outcomeRead.answer ?? "none"}`);
    log.push(`#${f.number} void: answer ${outcomeRead.answer}`);
    return;
  }
  let plan: number | null = null;
  if (conditionRead && conditionRead.state === "attested") {
    plan = planFromOracle(conditionRead.answer, plans);
    if (!plan) {
      await voidForecast(f.id, `no plan happened (oracle answered ${conditionRead.answer ?? "none"})`);
      log.push(`#${f.number} void: none of the plans happened`);
      return;
    }
  }

  const { error } = await db().from("forecast_resolutions").upsert({
    forecast_id: f.id,
    result: outcome,
    scenario: plan,
    evidence_label: `IMD ORACLE PANEL ${outcomeRead.panelSize ?? "?"} / QUORUM ${outcomeRead.quorum ?? "?"}${plan ? ` + WHICH-PLAN ORACLE: ${String.fromCharCode(64 + plan)}` : ""}`,
    evidence_url: `${serverConfig.imdApiUrl}/oracle/requests/${outcomeRead.requestId}/attestation`,
    evidence_note: [outcomeRead.note, conditionRead?.state === "attested" ? conditionRead.note : null].filter(Boolean).join(" | ") || null,
    verified: true,
    resolved_by: "KEEPER:IMD-ORACLE",
    resolved_at: outcomeRead.attestedAt ?? new Date().toISOString(),
  });
  if (error) {
    log.push(`#${f.number} resolution insert: ${error.message}`);
    return;
  }
  await patch(f.id, { pipeline_state: "resolved", status: "RESOLVED", last_error: null });
  log.push(`#${f.number} RESOLVED ${outcome}${plan ? ` under plan ${String.fromCharCode(64 + plan)}` : ""}`);
}

/* ------------------------------------------------------------------ */
/* Tick                                                                */
/* ------------------------------------------------------------------ */

async function lock(): Promise<boolean> {
  const now = Date.now();
  const { data } = await db().from("settings").select("value").eq("key", "tick_lock").maybeSingle();
  const held = typeof data?.value === "number" ? data.value : 0;
  if (now - held < 4 * 60_000) return false;
  await db().from("settings").upsert({ key: "tick_lock", value: now, updated_at: new Date().toISOString() });
  return true;
}

async function unlock(): Promise<void> {
  await db().from("settings").upsert({ key: "tick_lock", value: 0, updated_at: new Date().toISOString() });
}

export interface TickReport {
  ran: boolean;
  log: string[];
  at: string;
}

export async function tick(opts: { generate?: boolean } = {}): Promise<TickReport> {
  const log: string[] = [];
  const at = new Date().toISOString();
  if (!(await lock())) return { ran: false, log: ["another tick is running"], at };
  try {
    const paused = await isPaused();
    if (paused) log.push("PAUSED: only polling in flight work");

    // 0. launch gate: automatic questions start when the token CA is set (TOKEN_ADDRESS in .env)
    const token = tokenConfig();
    const gated = LAUNCH_REQUIRES_CA && !token.live;
    let launching = false;
    if (gated) {
      log.push("PRE-LAUNCH: automatic questions start when TOKEN_ADDRESS is set (manual questions still run)");
    } else if (token.live) {
      const { data: launched } = await db().from("settings").select("value").eq("key", "launched_at").maybeSingle();
      if (!launched) {
        launching = true;
        await db().from("settings").upsert({ key: "launched_at", value: { at: new Date().toISOString(), address: token.address }, updated_at: new Date().toISOString() });
        log.push(`LAUNCH: CA ${token.address} is live. Generating the first questions now.`);
      }
    }

    // 1. generate
    if (!paused && !gated && opts.generate !== false && hasGenerator()) {
      const done = await generatedToday();
      const need = serverConfig.questionsPerDay - done;
      const { data: last } = await db().from("settings").select("value").eq("key", "last_generate").maybeSingle();
      const since = Date.now() - (typeof last?.value === "number" ? last.value : 0);
      if (need > 0 && since < 60 * 60_000 && !launching) log.push(`generator cooling down (${Math.ceil((60 * 60_000 - since) / 60_000)}m)`);
      else if (need > 0) {
        await db().from("settings").upsert({ key: "last_generate", value: Date.now(), updated_at: new Date().toISOString() });
        try {
          const decisionsToday = await decisionsGeneratedToday();
          const g = await generateQuestions(Math.min(need, 3), await recentQuestions(), new Date(), Math.max(0, serverConfig.decisionsPerDay - decisionsToday));
          for (const q of g.accepted) {
            const row = await createForecast(fromGenerated(q, g.model, serverConfig.generateMode === "review"));
            log.push(`generated #${row.number}${q.scenarios?.length ? ` [${q.scenarios.length} PLANS]` : ""} ${serverConfig.generateMode === "review" ? "(draft)" : ""}: ${q.question}`);
          }
          g.rejected.forEach((r) => log.push(`rejected: ${r.reason}: ${r.q}`));
        } catch (e) {
          log.push(`generator error: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    // 2. poll in flight work (free)
    for (const f of await byState("forecasting", 8)) await advanceForecasting(f, log).catch((e) => log.push(`#${f.number} ${String(e)}`));
    for (const f of await byState("resolving", 8)) await advanceResolving(f, log).catch((e) => log.push(`#${f.number} ${String(e)}`));

    // 3. paid steps
    const gate = await canPay();
    if (!gate.ok) {
      log.push(`paid steps skipped: ${gate.reason}`);
    } else {
      for (const f of await byState("queued", 2)) await dispatchForecast(f, log);
      const due = (await byState("collected", 10)).filter((f) => resolveDueAt(f) <= Date.now()).slice(0, 2);
      for (const f of due) await dispatchResolution(f, log);
    }
    if (log.length === 0) log.push("idle");
    return { ran: true, log, at };
  } finally {
    await unlock();
  }
}

export async function pipelineOverview() {
  const { data } = await db()
    .from("forecasts")
    .select("id, number, question, category, deadline, status, pipeline_state, generated_by, forecast_job_id, oracle_request_id, attempts, last_error, created_at, resolution_criteria, oracle_question, scenarios")
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []) as (Omit<ForecastRow, "updated_at" | "source" | "resolution_method">)[];
}
