import type { Evidence, Forecast, Outcome, Prediction } from "./types";
import { brierTerm, isCorrect } from "./scoring";

/**
 * Resolution is the only step that turns predictions into score.
 * A KEEPER (resolver) attaches evidence and an outcome; FORECASTERS never
 * resolves from its own network signal.
 */

export type ResolutionMethod = "MARKET DATA" | "IMD API" | "ON CHAIN READ" | "PUBLIC RECORD" | "KEEPER REVIEW";

export function effectiveStatus(f: Forecast, now = Date.now()): Forecast["status"] {
  if (f.status === "OPEN" && Date.parse(f.deadline) <= now) return "CLOSED";
  return f.status;
}

export function resolveForecast(f: Forecast, result: Outcome, evidence: Evidence, at = new Date().toISOString()): Forecast {
  if (f.status === "RESOLVED" || f.status === "VOID") throw new Error("forecast already final");
  return { ...f, status: "RESOLVED", result, evidence, resolvedAt: at };
}

export interface ImpactRow {
  tokenId: string;
  pYes: number;
  correct: boolean;
  brier: number;
}

/** How a resolution moved each participant's record. */
export function trackRecordImpact(f: Forecast, predictions: Prediction[]): ImpactRow[] {
  const rows: ImpactRow[] = [];
  for (const p of predictions) {
    if (p.forecastId !== f.id) continue;
    const ok = isCorrect(p, f);
    const b = brierTerm(p, f);
    if (ok === null || b === null) continue;
    rows.push({ tokenId: p.agentTokenId, pYes: p.pYes, correct: ok, brier: b });
  }
  return rows.sort((a, b) => a.brier - b.brier);
}

export function timeRemaining(deadline: string, now = Date.now()): { ms: number; label: string } {
  const ms = Date.parse(deadline) - now;
  if (ms <= 0) return { ms: 0, label: "DEADLINE PASSED" };
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return { ms, label: `${d}D ${h}H REMAINING` };
  return { ms, label: `${h}H ${String(mm).padStart(2, "0")}M REMAINING` };
}

export const forecastNumber = (n: number): string => `#${String(n).padStart(5, "0")}`;
