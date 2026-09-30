import type { RawSwarmSeat, SeatActivity, SwarmSeat } from "./types";
import { bool, iso, num, str } from "./util";

/**
 * Activity windows. IMD's /swarm seat list exposes `working` and `last`
 * (last worked timestamp) but not live presence, so FORECASTERS derives a
 * coarse activity class and never labels a seat ONLINE from the list alone.
 * Live presence comes from /seats/:tokenId/standing on the agent dossier.
 */
export const ACTIVITY_WINDOWS = {
  active: 6 * 60 * 60 * 1000, // worked in the last 6h
  idle: 7 * 24 * 60 * 60 * 1000, // worked in the last 7d
} as const;

export function classifyActivity(working: boolean, last: string | null, now = Date.now()): SeatActivity {
  if (working) return "WORKING";
  if (!last) return "UNKNOWN";
  const age = now - Date.parse(last);
  if (age <= ACTIVITY_WINDOWS.active) return "ACTIVE";
  if (age <= ACTIVITY_WINDOWS.idle) return "IDLE";
  return "DORMANT";
}

export function normalizeSeat(key: string, raw: RawSwarmSeat, now = Date.now()): SwarmSeat {
  const tokenId = str(raw.tokenId) ?? key;
  const working = bool(raw.working) ?? false;
  const last = iso(raw.last);
  return {
    tokenId,
    agentId: str(raw.agentId),
    attempts: num(raw.attempts),
    accepted: num(raw.accepted),
    rejected: num(raw.rejected),
    failed: num(raw.failed),
    pending: num(raw.pending),
    queued: num(raw.queued),
    working,
    lastActivityAt: last,
    activity: classifyActivity(working, last, now),
  };
}

/**
 * Verified work rate: accepted / (accepted + rejected + failed).
 * Pending attempts are excluded because they are not decided yet.
 * Returns null when there is no decided work.
 */
export function verifiedRate(s: { accepted: number | null; rejected: number | null; failed: number | null }): number | null {
  const a = s.accepted ?? 0;
  const decided = a + (s.rejected ?? 0) + (s.failed ?? 0);
  if (decided === 0) return null;
  return a / decided;
}

export function decidedCount(s: { accepted: number | null; rejected: number | null; failed: number | null }): number {
  return (s.accepted ?? 0) + (s.rejected ?? 0) + (s.failed ?? 0);
}
