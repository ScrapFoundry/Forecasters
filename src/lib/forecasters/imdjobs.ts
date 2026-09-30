import type { JobDetail, JobFile } from "@/lib/imd/paid";

/**
 * Bodies for the two paid IMD actions of a forecast, plus the parser that
 * turns a finished forecast job into per agent predictions.
 *
 *   job.open        FORECAST   K forecasters, each writes artifacts/forecast_k.json
 *   oracle.request  RESOLUTION IMD oracle panel answers the past tense question (bool)
 */

export interface PipelineForecast {
  id: string;
  number: number;
  question: string;
  resolution_criteria: string | null;
  oracle_question: string | null;
  deadline: string;
  created_at: string;
  /** Snowmoon ch.27: 2 or 3 plans. The outcome is forecast under each. */
  scenarios?: string[] | null;
  /** Oracle question that returns which plan happened (1..n, 0 = none). */
  condition_question?: string | null;
}

/**
 * Job shapes, validated against IMD's real quote endpoint (free quotes, 2026-09-29):
 *   chain  ACCEPTED  K research-report steps in sequence, one forecast file each (default)
 *   panel  ACCEPTED  template "research" panel, no outputs allowed (IMD returns a report, not per agent files)
 *   fan_out_join     REJECTED by IMD: research steps cannot write in parallel
 * For fully independent forecasters use FORECAST_JOB_SHAPE=single: one job per forecaster (K x 0.5 IMD).
 */
export type ForecastJobShape = "chain" | "panel" | "single";

const FORECAST_FORMAT = `{"p_yes": <number between 0.01 and 0.99>, "rationale": "<max 600 chars>", "sources": ["<url>", "..."]}`;

const letter = (i: number) => String.fromCharCode(65 + i);

function forecasterObjective(f: PipelineForecast, k: number): string {
  const plans = f.scenarios?.length ? f.scenarios : null;
  const format = plans
    ? `{"p_yes_by_plan": {${plans.map((_, i) => `"${letter(i)}": <0.01 to 0.99>`).join(", ")}}, "rationale": "<max 600 chars>", "sources": ["<url>", "..."]}`
    : FORECAST_FORMAT;
  return [
    `You are forecaster ${k} on the FORECASTERS network. Estimate the probability that the answer to this question will be YES.`,
    ``,
    `QUESTION: ${f.question}`,
    `DEADLINE (UTC): ${f.deadline}`,
    f.resolution_criteria ? `RESOLVES YES WHEN: ${f.resolution_criteria}` : ``,
    plans ? `` : ``,
    plans ? `This is a decision between plans. Give one probability for the question under EACH plan, assuming that plan is the one that happens:` : ``,
    ...(plans ? plans.map((p, i) => `  ${letter(i)}) ${p}`) : []),
    plans ? `Only the plan that actually happens will be scored. Compare the plans honestly; do not copy one number across them unless you believe the plan truly makes no difference.` : ``,
    ``,
    `Research current evidence and commit to calibrated probabilities. Work independently: do not open any other artifacts/forecast_*.json file.`,
    `Write ONLY this JSON to artifacts/forecast_${k}.json:`,
    format,
    `Your score is computed later against the real outcome with the Brier rule. Overconfidence is penalized.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const forecastOutput = (k: number) => ({ name: `forecast_${k}`, path: `artifacts/forecast_${k}.json`, mediaType: "application/json" });

/** job.open input(s). `single` returns one body per forecaster. */
export function forecastJobInputs(f: PipelineForecast, panel: number, shape: ForecastJobShape = "chain"): Record<string, unknown>[] {
  if (shape === "single") {
    return Array.from({ length: panel }, (_, i) => ({ objective: forecasterObjective(f, i + 1), skill: "research-report", outputs: [forecastOutput(i + 1)], github: false }));
  }
  if (shape === "panel") {
    return [
      {
        objective: `${forecasterObjective(f, 1).split("Write ONLY")[0]}Each panel member states P(YES) as a number between 0.01 and 0.99 with a short rationale.`,
        template: "research",
        panelSize: panel,
        panelQuorum: 1,
        minCitations: 1,
        github: false,
      },
    ];
  }
  return [
    {
      objective: `FORECASTERS #${f.number}: ${panel} independent probability forecasts for: ${f.question}`,
      shape: "chain",
      steps: Array.from({ length: panel }, (_, i) => ({ skill: "research-report", objective: forecasterObjective(f, i + 1), outputs: [forecastOutput(i + 1)] })),
      github: false,
    },
  ];
}

/** Back compat: first body. */
export const forecastJobInput = (f: PipelineForecast, panel: number, shape: ForecastJobShape = "chain") => forecastJobInputs(f, panel, shape)[0]!;

/** oracle.request input used to resolve a forecast after its deadline. */
export function resolutionInput(f: PipelineForecast, panelSize: number, quorum: number): Record<string, unknown> {
  const hours = Math.min(720, Math.max(1, Math.ceil((Date.now() - Date.parse(f.created_at)) / 3_600_000) + 1));
  const question = [
    f.oracle_question || `As of ${f.deadline} UTC, did this resolve YES: ${f.question}`,
    f.resolution_criteria ? `Resolve true only if: ${f.resolution_criteria}` : "",
    `Deadline: ${f.deadline} UTC.`,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    v: 1,
    question: question.slice(0, 2000),
    chainId: 1,
    window: { hours },
    answerType: "bool",
    panelSize,
    quorum: Math.min(panelSize, Math.max(2, quorum)),
    validForSeconds: 86_400,
    evidence: "panel",
  };
}

/** oracle.request that answers which plan of a scenario question actually happened. */
export function conditionInput(f: PipelineForecast, panelSize: number, quorum: number): Record<string, unknown> | null {
  const plans = f.scenarios?.length ? f.scenarios : null;
  if (!plans) return null;
  const hours = Math.min(720, Math.max(1, Math.ceil((Date.now() - Date.parse(f.created_at)) / 3_600_000) + 1));
  const question = [
    f.condition_question || `Between ${f.created_at} and ${f.deadline} UTC, which of these plans actually happened?`,
    plans.map((p, i) => `Answer ${i + 1} if: ${p}.`).join(" "),
    `Answer 0 if none of them happened or it cannot be determined.`,
  ].join(" ");
  return {
    v: 1,
    question: question.slice(0, 2000),
    chainId: 1,
    window: { hours },
    answerType: "uint256",
    panelSize,
    quorum: Math.min(panelSize, Math.max(2, quorum)),
    validForSeconds: 86_400,
    evidence: "panel",
  };
}

/** IMD oracle uint256 answer to a plan index (1..n), 0 / null when none. */
export function planFromOracle(answer: string | null, plans: number): number | null {
  if (answer === null) return null;
  const a = answer.trim().toLowerCase();
  const n = /^0x[0-9a-f]+$/.test(a) ? Number(BigInt(a)) : Number(a);
  if (!Number.isInteger(n) || n < 0 || n > plans) return null;
  return n;
}

/* ------------------------------------------------------------------ */
/* Parsing a finished forecast job                                     */
/* ------------------------------------------------------------------ */

export interface ParsedPrediction {
  tokenId: string;
  pYes: number;
  /** 0 plain, 1..3 plan A..C */
  scenario: number;
  rationale: string | null;
  submittedAt: string;
  raw: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function toProb(x: unknown): number | null {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x.replace("%", "")) : NaN;
  if (!Number.isFinite(n)) return null;
  const p = n > 1 ? n / 100 : n;
  return p >= 0 && p <= 1 ? Math.min(0.99, Math.max(0.01, p)) : null;
}

/** {"A": 0.4, "B": 0.6} (or keys "1","2", or an array) -> [{scenario, pYes}] */
function planProbabilities(v: unknown, plans: number): { scenario: number; pYes: number }[] {
  if (!isObj(v)) return [];
  const map = v.p_yes_by_plan ?? v.p_yes_by_scenario ?? v.plans ?? v.scenarios;
  const out: { scenario: number; pYes: number }[] = [];
  for (let i = 0; i < plans; i++) {
    let raw: unknown;
    if (Array.isArray(map)) raw = map[i];
    else if (isObj(map)) raw = map[String.fromCharCode(65 + i)] ?? map[String.fromCharCode(97 + i)] ?? map[String(i + 1)];
    const p = isObj(raw) ? toProb(raw.p_yes ?? raw.probability) : toProb(raw);
    if (p !== null) out.push({ scenario: i + 1, pYes: p });
  }
  return out;
}

function probabilityOf(v: unknown): number | null {
  if (!isObj(v)) return null;
  for (const k of ["p_yes", "pYes", "probability", "p", "yes"]) {
    const x = v[k];
    const n = typeof x === "number" ? x : typeof x === "string" ? Number(x.replace("%", "")) : NaN;
    if (Number.isFinite(n)) {
      const p = n > 1 ? n / 100 : n;
      if (p >= 0 && p <= 1) return Math.min(0.99, Math.max(0.01, p));
    }
  }
  return null;
}

/** Extract forecast objects from one artifact, whatever the wrapper shape. */
export function extractForecasts(text: string): Record<string, unknown>[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      data = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.forecasts) ? data.forecasts : [data];
  return list.filter((x): x is Record<string, unknown> => isObj(x) && (probabilityOf(x) !== null || planProbabilities(x, 3).length > 0));
}

const indexOf = (path: string): number | null => {
  const m = path.match(/forecast[_-]?(\d+)\.json$/i);
  return m ? Number(m[1]) : null;
};

/**
 * Attribution: IMD /jobs/:id lists nodes with the seat that executed each.
 * Forecaster k is matched to the k-th executed node (join step excluded).
 * A file that cannot be tied to exactly one seat is kept out of the ledger:
 * an unattributed probability cannot build anyone's track record.
 */
export function attribute(
  detail: JobDetail,
  files: { file: JobFile; text: string }[],
  plans = 0,
): { predictions: ParsedPrediction[]; unattributed: number } {
  const seated = detail.nodes.filter((n) => n.seat && (n.state === "accepted" || n.state === "completed" || n.state === ""));
  const forecasterNodes = seated.filter((n) => !/join|collect|merge/i.test(n.key));
  const perFile = files
    .filter((f) => /forecast(_?\d+)?\.json$/i.test(f.file.path))
    .map((f) => ({ k: indexOf(f.file.path), items: extractForecasts(f.text) }));

  const out: ParsedPrediction[] = [];
  let unattributed = 0;
  const used = new Set<string>();

  for (const { k, items } of perFile) {
    const item = items[0];
    if (!item) continue;
    let node = null as (typeof forecasterNodes)[number] | null;
    if (forecasterNodes.length === 1) node = forecasterNodes[0] ?? null; // one seat job: its file is its forecast
    else if (k !== null) node = forecasterNodes[k - 1] ?? null;
    const tokenId = node?.seat?.tokenId;
    if (!tokenId || used.has(tokenId)) {
      unattributed += 1;
      continue;
    }
    const base = {
      tokenId,
      rationale: typeof item.rationale === "string" ? item.rationale.slice(0, 1000) : null,
      submittedAt: node?.updatedAt ?? new Date().toISOString(),
      raw: item,
    };
    if (plans > 0) {
      const per = planProbabilities(item, plans);
      if (per.length !== plans) {
        unattributed += 1; // a scenario forecast must cover every plan
        continue;
      }
      used.add(tokenId);
      per.forEach((x) => out.push({ ...base, scenario: x.scenario, pYes: x.pYes }));
    } else {
      const p = probabilityOf(item);
      if (p === null) {
        unattributed += 1;
        continue;
      }
      used.add(tokenId);
      out.push({ ...base, scenario: 0, pYes: p });
    }
  }
  return { predictions: out, unattributed };
}

/** IMD oracle bool answer to an outcome. */
export function outcomeFromOracle(answer: string | null): "YES" | "NO" | null {
  if (answer === null) return null;
  const a = answer.trim().toLowerCase();
  if (["true", "yes", "1", "0x01"].includes(a) || /^0x0*1$/.test(a)) return "YES";
  if (["false", "no", "0", "0x00"].includes(a) || /^0x0+$/.test(a)) return "NO";
  return null;
}
