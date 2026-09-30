import "server-only";
import { hasSupabase } from "@/lib/config/server";
import { publicConfig } from "@/lib/config/public";
import { getSupabase } from "@/lib/supabase/server";
import type { Evidence, Forecast, ForecastCategory, Ledger, Outcome, Prediction } from "./types";
import { CATEGORIES } from "./types";
import { demoLedger } from "./demo";

/**
 * Forecast ledger repository.
 *
 * Source priority:
 *   1. Supabase (FORECASTERS specific state) when SUPABASE_URL + key are set
 *   2. Seeded DEMO DATA when NEXT_PUBLIC_DEMO_MODE=true
 *   3. Empty ledger with source "none"
 *
 * Real and demo rows are never mixed in one response.
 */

interface ForecastRow {
  id: string;
  number: number | null;
  question: string;
  category: string | null;
  source: string | null;
  resolution_method: string | null;
  deadline: string;
  status: string;
  created_at: string;
  pipeline_state?: string | null;
  generated_by?: string | null;
  resolution_criteria?: string | null;
  forecast_job_id?: string | null;
  oracle_request_id?: string | null;
  scenarios?: unknown;
  forecast_resolutions?: ResolutionRow[] | ResolutionRow | null;
}

interface ResolutionRow {
  result: string;
  evidence_label: string | null;
  evidence_url: string | null;
  evidence_note: string | null;
  verified: boolean | null;
  resolved_at: string;
  scenario?: number | null;
}

interface PredictionRow {
  id: string;
  forecast_id: string;
  agent_token_id: string;
  p_yes: number;
  rationale: string | null;
  submitted_at: string;
  scenario?: number | null;
}

const asCategory = (c: string | null): ForecastCategory =>
  CATEGORIES.includes((c ?? "").toUpperCase() as ForecastCategory) ? ((c ?? "").toUpperCase() as ForecastCategory) : "GENERAL";

const asOutcome = (v: string | undefined): Outcome | null => (v === "YES" || v === "NO" ? v : null);

function mapForecast(row: ForecastRow): Forecast {
  const res = Array.isArray(row.forecast_resolutions) ? row.forecast_resolutions[0] : row.forecast_resolutions ?? undefined;
  const evidence: Evidence | null = res
    ? { label: res.evidence_label ?? "EVIDENCE", url: res.evidence_url, note: res.evidence_note, verified: Boolean(res.verified) }
    : null;
  const status = (["OPEN", "CLOSED", "RESOLVED", "VOID"].includes(row.status) ? row.status : "OPEN") as Forecast["status"];
  return {
    id: row.id,
    number: row.number ?? 0,
    question: row.question,
    category: asCategory(row.category),
    source: row.source ?? "UNKNOWN",
    resolutionMethod: row.resolution_method ?? "KEEPER REVIEW",
    createdAt: row.created_at,
    deadline: row.deadline,
    status: res ? "RESOLVED" : status,
    result: asOutcome(res?.result),
    evidence,
    resolvedAt: res?.resolved_at ?? null,
    demo: false,
    scenarios: Array.isArray(row.scenarios) && row.scenarios.every((x) => typeof x === "string") && row.scenarios.length >= 2 ? (row.scenarios as string[]) : null,
    realizedScenario: typeof res?.scenario === "number" ? res.scenario : null,
    pipeline: row.pipeline_state
      ? {
          state: row.pipeline_state,
          generatedBy: row.generated_by ?? "operator",
          criteria: row.resolution_criteria ?? null,
          forecastJobId: row.forecast_job_id ?? null,
          oracleRequestId: row.oracle_request_id ?? null,
        }
      : null,
  };
}

const mapPrediction = (r: PredictionRow): Prediction => ({
  id: r.id,
  forecastId: r.forecast_id,
  agentTokenId: String(r.agent_token_id),
  pYes: Number(r.p_yes),
  submittedAt: r.submitted_at,
  scenario: typeof r.scenario === "number" ? r.scenario : 0,
  rationale: r.rationale,
  demo: false,
});

async function supabaseLedger(): Promise<Ledger> {
  const db = getSupabase();
  const now = new Date().toISOString();
  if (!db) return { source: "none", forecasts: [], predictions: [], generatedAt: now, error: "supabase not configured" };

  const [f, p] = await Promise.all([
    db
      .from("forecasts")
      .select(
        "id, number, question, category, source, resolution_method, deadline, status, created_at, pipeline_state, generated_by, resolution_criteria, forecast_job_id, oracle_request_id, scenarios, forecast_resolutions(result, evidence_label, evidence_url, evidence_note, verified, resolved_at, scenario)",
      )
      .neq("status", "DRAFT")
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("predictions")
      .select("id, forecast_id, agent_token_id, p_yes, rationale, submitted_at, scenario")
      .order("submitted_at", { ascending: false })
      .limit(10000),
  ]);

  if (f.error || p.error) {
    return { source: "supabase", forecasts: [], predictions: [], generatedAt: now, error: (f.error ?? p.error)?.message ?? "query failed" };
  }
  return {
    source: "supabase",
    forecasts: (f.data as unknown as ForecastRow[]).map(mapForecast),
    predictions: (p.data as unknown as PredictionRow[]).map(mapPrediction),
    generatedAt: now,
    error: null,
  };
}

export async function getLedger(): Promise<Ledger> {
  if (hasSupabase()) {
    try {
      return await supabaseLedger();
    } catch (e) {
      return { source: "supabase", forecasts: [], predictions: [], generatedAt: new Date().toISOString(), error: e instanceof Error ? e.message : "ledger error" };
    }
  }
  if (publicConfig.demoMode) return demoLedger();
  return { source: "none", forecasts: [], predictions: [], generatedAt: new Date().toISOString(), error: null };
}

export async function getForecast(id: string): Promise<{ ledger: Ledger; forecast: Forecast | null }> {
  const ledger = await getLedger();
  return { ledger, forecast: ledger.forecasts.find((f) => f.id === id) ?? null };
}
