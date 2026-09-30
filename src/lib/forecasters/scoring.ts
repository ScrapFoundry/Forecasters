import type { AgentRecord, Forecast, ForecastCategory, Prediction, Tier } from "./types";
import { confidenceOf, outcomeOf } from "./types";

/**
 * Transparent scoring.
 *
 *   accuracy        = correct / resolved
 *   brier           = mean over resolved of (pYes - y)^2, y = 1 if YES else 0
 *   score           = 100 * (1 - brier)                (0 worst, 100 perfect)
 *   calibrationGap  = | mean confidence - accuracy |
 *   recent          = correct - incorrect over the last 5 resolved
 *   tier            = SENTINEL when resolved >= 10 AND score >= 90, else ACOLYTE
 *
 * Every number shown in the UI traces back to one of these lines.
 */

export const RECENT_WINDOW = 5;
export const SENTINEL_MIN_RESOLVED = 10;
/** Snowmoon ch.1: an Acolyte whose prediction score falls below 90 does not advance. */
export const SENTINEL_MIN_SCORE = 90;

export const SCORING_FORMULAS = [
  ["ACCURACY", "correct / resolved"],
  ["BRIER", "mean (p_yes - y)^2 over resolved, y = 1 if YES"],
  ["SCORE", "100 x (1 - BRIER)"],
  ["CALIBRATION GAP", "| mean confidence - accuracy |"],
  ["RECENT", `correct - incorrect, last ${RECENT_WINDOW} resolved`],
  ["TIER", `SENTINEL at ${SENTINEL_MIN_RESOLVED}+ resolved and score >= ${SENTINEL_MIN_SCORE}, else ACOLYTE`],
] as const;

export const tierFor = (resolved: number, score: number | null = null): Tier =>
  resolved >= SENTINEL_MIN_RESOLVED && (score === null || score >= SENTINEL_MIN_SCORE) ? "SENTINEL" : "ACOLYTE";

/**
 * A prediction is scored only when its forecast resolved and, for scenario
 * questions, only if it was made for the plan that actually happened.
 * Predictions for plans that did not happen are void (never scored).
 */
export function isScored(p: Prediction, f: Forecast): boolean {
  if (f.status !== "RESOLVED" || !f.result) return false;
  if (f.scenarios && f.scenarios.length) return (p.scenario ?? 0) === (f.realizedScenario ?? -1);
  return true;
}

export function isCorrect(p: Prediction, f: Forecast): boolean | null {
  if (!isScored(p, f)) return null;
  return outcomeOf(p.pYes) === f.result;
}

export function brierTerm(p: Prediction, f: Forecast): number | null {
  if (!isScored(p, f)) return null;
  const y = f.result === "YES" ? 1 : 0;
  return (p.pYes - y) ** 2;
}

function emptyRecord(tokenId: string): AgentRecord {
  return {
    tokenId,
    forecasts: 0,
    resolved: 0,
    correct: 0,
    incorrect: 0,
    accuracy: null,
    brier: null,
    score: null,
    calibrationGap: null,
    meanConfidence: null,
    recent: 0,
    streak: 0,
    categories: {},
    tier: "ACOLYTE",
    lastPredictionAt: null,
  };
}

export function computeRecords(forecasts: Forecast[], predictions: Prediction[]): Map<string, AgentRecord> {
  const byId = new Map(forecasts.map((f) => [f.id, f]));
  const grouped = new Map<string, Prediction[]>();
  for (const p of predictions) {
    const list = grouped.get(p.agentTokenId) ?? [];
    list.push(p);
    grouped.set(p.agentTokenId, list);
  }

  const out = new Map<string, AgentRecord>();
  for (const [tokenId, preds] of grouped) {
    const r = emptyRecord(tokenId);
    let brierSum = 0;
    let confSum = 0;
    const resolvedSeq: { at: number; ok: boolean }[] = [];

    const counted = new Set<string>();
    for (const p of preds) {
      const f = byId.get(p.forecastId);
      if (!f || f.status === "VOID") continue;
      if (!counted.has(f.id)) {
        counted.add(f.id);
        r.forecasts += 1; // a scenario question counts once, whatever the number of plans
      }
      if (!r.lastPredictionAt || p.submittedAt > r.lastPredictionAt) r.lastPredictionAt = p.submittedAt;
      const ok = isCorrect(p, f);
      if (ok === null) continue;
      r.resolved += 1;
      if (ok) r.correct += 1;
      else r.incorrect += 1;
      brierSum += brierTerm(p, f) ?? 0;
      confSum += confidenceOf(p.pYes);
      const cat = (r.categories[f.category as ForecastCategory] ??= { resolved: 0, correct: 0 });
      cat.resolved += 1;
      if (ok) cat.correct += 1;
      resolvedSeq.push({ at: Date.parse(f.resolvedAt ?? f.deadline), ok });
    }

    if (r.resolved > 0) {
      r.accuracy = r.correct / r.resolved;
      r.brier = brierSum / r.resolved;
      r.score = 100 * (1 - r.brier);
      r.meanConfidence = confSum / r.resolved;
      r.calibrationGap = Math.abs(r.meanConfidence - r.accuracy);
      resolvedSeq.sort((a, b) => b.at - a.at);
      r.recent = resolvedSeq.slice(0, RECENT_WINDOW).reduce((s, x) => s + (x.ok ? 1 : -1), 0);
      const first = resolvedSeq[0];
      if (first) {
        let n = 0;
        for (const x of resolvedSeq) {
          if (x.ok !== first.ok) break;
          n += 1;
        }
        r.streak = first.ok ? n : -n;
      }
    }
    r.tier = tierFor(r.resolved, r.score ?? 0);
    out.set(tokenId, r);
  }
  return out;
}

/** Calibration table: bucketed stated confidence vs realized hit rate. */
export function calibrationBuckets(forecasts: Forecast[], predictions: Prediction[], edges = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0001]) {
  const byId = new Map(forecasts.map((f) => [f.id, f]));
  const buckets = edges.slice(0, -1).map((lo, i) => ({ lo, hi: Math.min(1, edges[i + 1] ?? 1), n: 0, hits: 0 }));
  for (const p of predictions) {
    const f = byId.get(p.forecastId);
    if (!f) continue;
    const ok = isCorrect(p, f);
    if (ok === null) continue;
    const c = confidenceOf(p.pYes);
    const b = buckets.find((x) => c >= x.lo && c < x.hi) ?? buckets[buckets.length - 1];
    if (!b) continue;
    b.n += 1;
    if (ok) b.hits += 1;
  }
  return buckets.map((b) => ({ ...b, rate: b.n ? b.hits / b.n : null }));
}
