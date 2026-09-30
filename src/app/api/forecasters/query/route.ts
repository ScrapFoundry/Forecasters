import { getOracleRequests, getSwarm } from "@/lib/imd/client";
import { relatedRequests, isAttested } from "@/lib/imd/oracle";
import { getLedger } from "@/lib/forecasters/forecast";
import { computeRecords } from "@/lib/forecasters/scoring";
import { selectForecasters, rankSeatsByWork } from "@/lib/forecasters/rankings";
import { aggregate } from "@/lib/forecasters/consensus";
import { simulatePredictions } from "@/lib/forecasters/simulate";
import { publicConfig } from "@/lib/config/public";
import { getSupabase } from "@/lib/supabase/server";
import { verifiedRate, decidedCount } from "@/lib/imd/seats";
import { findDissent, type OracleQueryResponse, type ScenarioResult, type SelectedForecaster } from "@/lib/forecasters/query";

/**
 * POST /api/forecasters/query
 *
 * 1. selects forecasters by transparent track record
 * 2. searches REAL attested IMD oracle history for related questions
 * 3. IMD exposes no forecast submission endpoint, so agent answers cannot be
 *    requested yet. In demo mode the signal is produced by the FORECASTERS
 *    simulator and labeled SIMULATED. Outside demo mode the signal is null.
 */

const hits = new Map<string, { n: number; at: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) {
    hits.set(ip, { n: 1, at: now });
    return false;
  }
  h.n += 1;
  return h.n > 12;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return Response.json({ error: "RATE LIMITED. RETRY IN 60s." }, { status: 429 });

  let question = "";
  let scenarioLabels: string[] = [];
  try {
    const body = (await req.json()) as { question?: unknown; scenarios?: unknown };
    question = typeof body.question === "string" ? body.question.trim().replace(/\s+/g, " ") : "";
    if (Array.isArray(body.scenarios)) {
      scenarioLabels = body.scenarios
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim().replace(/\s+/g, " "))
        .filter((x) => x.length > 0);
    }
  } catch {
    return Response.json({ error: "INVALID REQUEST" }, { status: 400 });
  }
  if (question.length < 8 || question.length > 280) {
    return Response.json({ error: "QUESTION MUST BE 8 TO 280 CHARACTERS" }, { status: 400 });
  }
  if (scenarioLabels.length > 3 || scenarioLabels.some((x) => x.length < 3 || x.length > 140)) {
    return Response.json({ error: "UP TO 3 SCENARIOS, 3 TO 140 CHARACTERS EACH" }, { status: 400 });
  }

  const [ledger, swarm, oracle] = await Promise.all([getLedger(), getSwarm(), getOracleRequests()]);
  const records = Array.from(computeRecords(ledger.forecasts, ledger.predictions).values());

  let basis: OracleQueryResponse["basis"];
  let selected: SelectedForecaster[] = [];

  if (records.some((r) => r.resolved > 0)) {
    basis = ledger.source === "supabase" ? "FORECAST RECORD" : "FORECAST RECORD (DEMO DATA)";
    selected = selectForecasters(records, 5).map((r) => ({
      tokenId: r.tokenId,
      metric: r.accuracy,
      resolved: r.resolved,
      correct: r.correct,
      recent: r.recent,
      tier: r.tier,
    }));
  } else if (swarm.ok) {
    basis = "VERIFIED WORK RECORD (LIVE IMD)";
    selected = rankSeatsByWork(swarm.data.seats).slice(0, 5).map((s) => ({
      tokenId: s.tokenId,
      metric: verifiedRate(s),
      resolved: decidedCount(s),
      correct: s.accepted ?? 0,
      recent: 0,
      tier: decidedCount(s) >= 10 ? "SENTINEL" : "ACOLYTE",
    }));
  } else {
    basis = "UNAVAILABLE";
  }

  const related = oracle.ok ? relatedRequests(question, oracle.data.requests.filter(isAttested)) : [];

  const recordOf = (id: string) => {
    const x = selected.find((y) => y.tokenId === id);
    return x ? { correct: x.correct, resolved: x.resolved, accuracy: x.metric } : undefined;
  };
  const run = (label: string, scenario: string): ScenarioResult => {
    const predictions = simulatePredictions(question, selected, scenario);
    return { label, predictions, signal: aggregate(predictions.map((p) => ({ tokenId: p.tokenId, pYes: p.pYes, record: recordOf(p.tokenId) }))) };
  };

  let signal: OracleQueryResponse["signal"] = null;
  let predictions: OracleQueryResponse["predictions"] = [];
  let scenarios: ScenarioResult[] = [];
  const simulate = publicConfig.demoMode && selected.length > 0;
  if (scenarioLabels.length) {
    scenarios = scenarioLabels.map((label) => (simulate ? run(label, label) : { label, predictions: [], signal: null }));
  } else if (simulate) {
    const one = run("QUESTION", "");
    predictions = one.predictions;
    signal = one.signal;
  }
  const dissent = findDissent(scenarios.length ? scenarios : signal ? [{ label: "QUESTION", predictions, signal }] : []);

  const db = getSupabase();
  if (db) {
    await db
      .from("oracle_queries")
      .insert({ question, selected: selected.map((s) => s.tokenId), basis, simulated: simulate })
      .then(() => undefined, () => undefined);
  }

  const payload: OracleQueryResponse = {
    question,
    basis,
    selected,
    predictions,
    signal,
    scenarios,
    dissent,
    simulated: simulate,
    dispatch: "NOT CONNECTED",
    related,
    imd: { swarm: swarm.ok, oracle: oracle.ok },
    at: new Date().toISOString(),
  };
  return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
}
