import type { Job, NetworkEvent, OracleRequest, RawSwarm, RawSwarmSeat, Swarm, SwarmSeat } from "./types";
import { bool, iso, isObj, num } from "./util";
import { normalizeSeat } from "./seats";

export function normalizeSwarm(raw: RawSwarm): Swarm {
  const now = Date.now();
  const h = isObj(raw.health) ? raw.health : {};
  const c = isObj(raw.counts) ? raw.counts : {};

  let seats: SwarmSeat[] = [];
  if (Array.isArray(raw.seats)) {
    seats = raw.seats.map((s, i) => normalizeSeat(String(i), s, now));
  } else if (isObj(raw.seats)) {
    seats = Object.entries(raw.seats as Record<string, RawSwarmSeat>).map(([k, s]) => normalizeSeat(k, s, now));
  }
  seats.sort((a, b) => Number(a.tokenId) - Number(b.tokenId));

  const jobStates: Record<string, number> = {};
  if (isObj(c.jobStates)) {
    for (const [k, v] of Object.entries(c.jobStates)) {
      const n = num(v);
      if (n !== null) jobStates[k] = n;
    }
  }

  const totals = seats.reduce(
    (t, s) => {
      t.attempts += s.attempts ?? 0;
      t.accepted += s.accepted ?? 0;
      t.rejected += s.rejected ?? 0;
      t.failed += s.failed ?? 0;
      t.pending += s.pending ?? 0;
      if (s.working) t.workingSeats += 1;
      if (s.activity === "WORKING" || s.activity === "ACTIVE") t.activeSeats += 1;
      return t;
    },
    { seats: seats.length, attempts: 0, accepted: 0, rejected: 0, failed: 0, pending: 0, workingSeats: 0, activeSeats: 0 },
  );

  return {
    at: iso(raw.at),
    health: {
      reachable: bool(h.reachable),
      agentsOnline: num(h.agentsOnline),
      workingNow: num(h.workingNow),
      acceptedLastDay: num(h.acceptedLastDay),
      jobsDoneLastDay: num(h.jobsDoneLastDay),
      oraclesDoneLastDay: num(h.oraclesDoneLastDay),
      seatsEnrolled: num(h.seatsEnrolled),
      pendingVerification: num(h.pendingVerification),
      pendingDeployment: num(h.pendingDeployment),
      pendingSites: num(h.pendingSites),
      verifierUp: bool(h.verifierUp),
      publisherUp: bool(h.publisherUp),
      deployerUp: bool(h.deployerUp),
    },
    counts: {
      jobs: num(c.jobs),
      jobStates,
      tasksInProgress: num(c.tasksInProgress),
      launchesLive: num(c.launchesLive),
      sites: num(c.sites),
      inferenceTokens: num(c.inferenceTokens),
      events: num(c.events),
    },
    seats,
    totals,
  };
}

const shortId = (id: string) => id.slice(0, 4).toUpperCase();

/**
 * Builds the network event stream from real IMD timestamps only:
 * seat `last`, job createdAt / updatedAt and oracle createdAt / attestedAt.
 * Nothing here is synthesized; if a feed is missing its events are absent.
 */
export function deriveEvents(
  swarm: Swarm | null,
  jobs: Job[] | null,
  oracle: OracleRequest[] | null,
  limit = 60,
): NetworkEvent[] {
  const out: NetworkEvent[] = [];

  if (swarm) {
    for (const s of swarm.seats) {
      if (!s.lastActivityAt) continue;
      out.push({
        id: `seat-${s.tokenId}-${s.lastActivityAt}`,
        at: s.lastActivityAt,
        kind: "seat",
        text: s.working ? `agent #${s.tokenId} working` : `agent #${s.tokenId} submitted work`,
        ref: `/agents/${s.tokenId}`,
      });
    }
  }

  if (jobs) {
    for (const j of jobs) {
      if (j.createdAt) {
        out.push({
          id: `job-new-${j.id}`,
          at: j.createdAt,
          kind: "job-posted",
          text: `job ${shortId(j.id)} posted ${j.kind}`,
          ref: null,
        });
      }
      if (j.updatedAt && j.updatedAt !== j.createdAt) {
        if (j.state === "completed") {
          out.push({ id: `job-done-${j.id}`, at: j.updatedAt, kind: "job-completed", text: `job ${shortId(j.id)} completed`, ref: null });
        } else if (j.state === "blocked") {
          out.push({ id: `job-blk-${j.id}`, at: j.updatedAt, kind: "job-blocked", text: `job ${shortId(j.id)} blocked`, ref: null });
        }
      }
    }
  }

  if (oracle) {
    for (const o of oracle) {
      if (o.createdAt) {
        out.push({ id: `or-new-${o.id}`, at: o.createdAt, kind: "oracle-called", text: `oracle ${shortId(o.id)} called`, ref: `/oracle?request=${o.id}` });
      }
      if (o.attestedAt) {
        out.push({ id: `or-att-${o.id}`, at: o.attestedAt, kind: "oracle-attested", text: `oracle ${shortId(o.id)} attested`, ref: `/oracle?request=${o.id}` });
      }
    }
  }

  const now = Date.now() + 60_000;
  return out
    .filter((e) => Date.parse(e.at) <= now)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}
