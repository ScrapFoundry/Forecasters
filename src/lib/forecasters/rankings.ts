import type { AgentRecord } from "./types";
import type { SwarmSeat } from "@/lib/imd/types";
import { decidedCount } from "@/lib/imd/seats";

/**
 * SELECTED FORECASTERS
 *
 * Selection is by track record, not by claims:
 *   1. require at least `minResolved` resolved forecasts
 *   2. rank by Laplace shrunk accuracy (correct+1)/(resolved+2)
 *   3. tie break by resolved count, then by recent performance
 */

export const shrunkAccuracy = (correct: number, n: number): number => (correct + 1) / (n + 2);

export function rankRecords(records: AgentRecord[], minResolved = 0): AgentRecord[] {
  return records
    .filter((r) => r.resolved >= minResolved)
    .sort(
      (a, b) =>
        shrunkAccuracy(b.correct, b.resolved) - shrunkAccuracy(a.correct, a.resolved) ||
        b.resolved - a.resolved ||
        b.recent - a.recent ||
        Number(a.tokenId) - Number(b.tokenId),
    );
}

export function selectForecasters(records: AgentRecord[], n = 5, minResolved = 5): AgentRecord[] {
  const eligible = rankRecords(records, minResolved);
  return (eligible.length >= n ? eligible : rankRecords(records, 0)).slice(0, n);
}

/**
 * Live alternative that uses only real IMD data: rank seats by the verified
 * work record IMD publishes (accepted vs rejected + failed, independently re-run).
 * This is a work record, not a forecast record, and the UI labels it as such.
 */
export function rankSeatsByWork(seats: SwarmSeat[], minDecided = 20): SwarmSeat[] {
  return seats
    .filter((s) => decidedCount(s) >= minDecided)
    .sort((a, b) => {
      const da = decidedCount(a);
      const db = decidedCount(b);
      return (
        shrunkAccuracy(b.accepted ?? 0, db) - shrunkAccuracy(a.accepted ?? 0, da) ||
        db - da ||
        Number(a.tokenId) - Number(b.tokenId)
      );
    });
}
