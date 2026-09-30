import type { AgentDossier, RawAgentCard, RawRuntime, RawSeat, RawSeatStanding, Runtime, SeatWork } from "./types";
import { bool, iso, isObj, num, str, strArr } from "./util";

const runtimes = (list: unknown): Runtime[] =>
  Array.isArray(list)
    ? (list as RawRuntime[]).map((r) => ({
        id: str(r?.id) ?? "unknown",
        version: str(r?.version),
        model: str(r?.premiumModel?.model),
        effort: str(r?.premiumModel?.effort),
      }))
    : [];

const work = (list: unknown): SeatWork[] =>
  Array.isArray(list)
    ? list.filter(isObj).map((w) => ({
        jobId: str(w.jobId),
        objective: str(w.objective),
        jobState: str(w.jobState),
        nodeKey: str(w.nodeKey),
        role: str(w.role),
        status: str(w.status),
        submittedAt: iso(w.submittedAt),
      }))
    : [];

export function buildDossier(
  tokenId: string,
  card: RawAgentCard | null,
  seat: RawSeat | null,
  standing: RawSeatStanding | null,
  explorerBase: string,
): AgentDossier {
  const reg = card?.registrations?.[0];
  const p = standing?.presence;
  const st = standing?.standing;
  const platform = p?.platform ? [p.platform.os, p.platform.arch].filter(Boolean).join("/") || null : null;

  return {
    tokenId,
    identity: card
      ? {
          name: str(card.name),
          description: str(card.description),
          active: bool(card.active),
          enrolled: bool(card.enrolled),
          agentId: str(reg?.agentId),
          registry: str(reg?.agentRegistry),
          tokenContract: str(reg?.tokenContract),
          chainId: num(reg?.chainId),
          explorerUrl: `${explorerBase}/agents/${tokenId}`,
          supportedTrust: strArr(card.supportedTrust),
        }
      : null,
    seat: seat
      ? {
          status: str(seat.status),
          owner: str(seat.owner),
          ownership: str(seat.ownership),
          pairedAt: iso(seat.pairedAt),
          online: bool(seat.online),
          daemonVersion: str(seat.daemonVersion),
          devices: num(seat.devices),
          runtimes: runtimes(seat.runtimes),
          attempts: num(seat.attempts),
          accepted: num(seat.accepted),
          rejected: num(seat.rejected),
          failed: num(seat.failed),
          pending: num(seat.pending),
          work: work(seat.work),
        }
      : null,
    standing: standing
      ? {
          connected: bool(p?.connected),
          acceptingWork: bool(p?.acceptingWork),
          stale: bool(p?.stale),
          lastHeartbeatAt: iso(p?.lastHeartbeatAt),
          heartbeatAgeMs: num(p?.heartbeatAgeMs),
          maxConcurrency: num(p?.maxConcurrency),
          kinds: strArr(p?.kinds),
          skills: strArr(p?.skills),
          consecutiveFailures: num(st?.consecutiveFailures),
          pausedUntil: iso(st?.pausedUntil),
          working: num(st?.working),
          fleetOnline: num(standing.queue?.fleetOnline),
          platform,
        }
      : null,
    sources: { identity: Boolean(card), seat: Boolean(seat), standing: Boolean(standing) },
  };
}

/** Presence label for the dossier, only from live standing / seat data. */
export function presenceLabel(d: AgentDossier): "ONLINE" | "STALE" | "OFFLINE" | "PAUSED" | "UNKNOWN" {
  if (d.standing?.pausedUntil && Date.parse(d.standing.pausedUntil) > Date.now()) return "PAUSED";
  if (d.standing?.connected === true) return d.standing.stale ? "STALE" : "ONLINE";
  if (d.standing?.connected === false) return "OFFLINE";
  if (d.seat?.online === true) return "ONLINE";
  if (d.seat?.online === false) return "OFFLINE";
  return "UNKNOWN";
}
