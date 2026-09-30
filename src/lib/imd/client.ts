import "server-only";
import { serverConfig } from "@/lib/config/server";
import type {
  AgentDossier,
  ImdResult,
  OracleLedger,
  OracleRequest,
  RawAgentCard,
  RawJobs,
  RawOracleRequest,
  RawOracleRequests,
  RawSeat,
  RawSeatOwners,
  RawSeatRecords,
  RawSeatStanding,
  RawSwarm,
  Swarm,
  Job,
} from "./types";
import { normalizeSwarm } from "./swarm";
import { normalizeJobs } from "./jobs";
import { normalizeOracleLedger, normalizeOracleRequest } from "./oracle";
import { buildDossier } from "./agents";

/**
 * Centralized IMD read client.
 *
 * Only documented GET endpoints are used. There are no writes to IMD from
 * FORECASTERS. Every call is server side, time boxed, cached for a short
 * window with Next's fetch cache, and wrapped in an ImdResult so a failure
 * never throws into a page.
 */

const TOKEN_ID = /^\d{1,7}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidTokenId = (v: string): boolean => TOKEN_ID.test(v);
export const isValidOracleId = (v: string): boolean => UUID.test(v);

/**
 * Short in-process cache with request coalescing. Upstream is hit at most
 * once per `ttl` seconds per path, no matter how many visitors poll. Failures
 * are never cached and never masked by stale data: the client keeps its own
 * last good snapshot and marks the feed DEGRADED.
 */
const memo = new Map<string, { at: number; value: ImdResult<unknown> }>();
const inflight = new Map<string, Promise<ImdResult<unknown>>>();

async function imdGet<T>(path: string, ttl: number): Promise<ImdResult<T>> {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < ttl * 1000) return hit.value as ImdResult<T>;
  const pending = inflight.get(path);
  if (pending) return pending as Promise<ImdResult<T>>;

  const p = fetchUpstream<T>(path).then((r) => {
    inflight.delete(path);
    if (r.ok) memo.set(path, { at: Date.now(), value: r });
    if (memo.size > 500) memo.delete(memo.keys().next().value as string);
    return r;
  });
  inflight.set(path, p as Promise<ImdResult<unknown>>);
  return p;
}

async function fetchUpstream<T>(path: string): Promise<ImdResult<T>> {
  const url = `${serverConfig.imdApiUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), serverConfig.imdTimeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "forecasters/0.1 (+read-only)" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, data: null, error: `IMD ${res.status} on ${path}`, fetchedAt: Date.now(), source: "imd" };
    }
    const data = (await res.json()) as T;
    return { ok: true, data, fetchedAt: Date.now(), source: "imd" };
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "unreachable";
    return { ok: false, data: null, error: `IMD ${reason} on ${path}`, fetchedAt: Date.now(), source: "imd" };
  } finally {
    clearTimeout(timer);
  }
}

function mapResult<A, B>(r: ImdResult<A>, fn: (a: A) => B): ImdResult<B> {
  return r.ok ? { ...r, data: fn(r.data) } : r;
}

/* ------------------------------ reads ------------------------------ */

export async function getSwarm(): Promise<ImdResult<Swarm>> {
  return mapResult(await imdGet<RawSwarm>("/swarm", 5), normalizeSwarm);
}

export async function getJobs(): Promise<ImdResult<Job[]>> {
  return mapResult(await imdGet<RawJobs>("/jobs", 10), normalizeJobs);
}

export async function getOracleRequests(): Promise<ImdResult<OracleLedger>> {
  return mapResult(await imdGet<RawOracleRequests>("/oracle/requests", 10), normalizeOracleLedger);
}

export async function getOracleRequest(id: string): Promise<ImdResult<OracleRequest>> {
  if (!isValidOracleId(id)) {
    return { ok: false, data: null, error: "invalid oracle id", fetchedAt: Date.now(), source: "imd" };
  }
  return mapResult(await imdGet<RawOracleRequest>(`/oracle/requests/${id}`, 60), normalizeOracleRequest);
}

export async function getAgentCard(tokenId: string): Promise<ImdResult<RawAgentCard>> {
  return imdGet<RawAgentCard>(`/agents/by-token/${tokenId}.json`, 300);
}

export async function getSeat(tokenId: string): Promise<ImdResult<RawSeat>> {
  return imdGet<RawSeat>(`/seats/${tokenId}`, 15);
}

export async function getSeatStanding(tokenId: string): Promise<ImdResult<RawSeatStanding>> {
  return imdGet<RawSeatStanding>(`/seats/${tokenId}/standing`, 15);
}

export async function getSeatRecords(): Promise<ImdResult<RawSeatRecords>> {
  return imdGet<RawSeatRecords>("/seats/records", 30);
}

export async function getSeatOwners(): Promise<ImdResult<{ count: number | null; holders: number | null }>> {
  return mapResult(await imdGet<RawSeatOwners>("/seats/owners", 300), (o) => ({
    count: typeof o.count === "number" ? o.count : null,
    holders: typeof o.holders === "number" ? o.holders : null,
  }));
}

/** Agent dossier combines three reads. Partial success still renders. */
export async function getAgent(tokenId: string): Promise<ImdResult<AgentDossier>> {
  if (!isValidTokenId(tokenId)) {
    return { ok: false, data: null, error: "invalid token id", fetchedAt: Date.now(), source: "imd" };
  }
  const [card, seat, standing] = await Promise.all([
    getAgentCard(tokenId),
    getSeat(tokenId),
    getSeatStanding(tokenId),
  ]);
  if (!card.ok && !seat.ok && !standing.ok) {
    return { ok: false, data: null, error: seat.error, fetchedAt: Date.now(), source: "imd" };
  }
  return {
    ok: true,
    data: buildDossier(
      tokenId,
      card.ok ? card.data : null,
      seat.ok ? seat.data : null,
      standing.ok ? standing.data : null,
      serverConfig.imdExplorerUrl,
    ),
    fetchedAt: Date.now(),
    source: "imd",
  };
}

/** Raw agent SVG, proxied so the browser only talks to FORECASTERS. */
export async function getAgentImage(tokenId: string): Promise<{ ok: boolean; body: string | null }> {
  if (!isValidTokenId(tokenId)) return { ok: false, body: null };
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), serverConfig.imdTimeoutMs);
    const res = await fetch(`${serverConfig.imdApiUrl}/agents/by-token/${tokenId}.svg`, {
      signal: controller.signal,
      cache: "force-cache",
      next: { revalidate: 3600 },
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, body: null };
    const body = await res.text();
    if (!body.trimStart().startsWith("<svg") && !body.trimStart().startsWith("<?xml")) return { ok: false, body: null };
    return { ok: true, body };
  } catch {
    return { ok: false, body: null };
  }
}

/** Runtime / model per seat (live IMD /seats/:id), for showing the competition between AIs. */
export async function getSeatModels(tokenIds: string[]): Promise<Record<string, string | null>> {
  const ids = [...new Set(tokenIds.filter(isValidTokenId))].slice(0, 30);
  const out: Record<string, string | null> = {};
  await Promise.all(
    ids.map(async (id) => {
      const r = await imdGet<RawSeat>(`/seats/${id}`, 600);
      const rt = r.ok && Array.isArray(r.data.runtimes) ? r.data.runtimes[0] : undefined;
      out[id] = rt ? (rt.premiumModel?.model ?? rt.id ?? null) : null;
    }),
  );
  return out;
}
