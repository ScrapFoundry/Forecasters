import type { OracleLedger, OracleRequest, RawOracleRequest, RawOracleRequests } from "./types";
import { iso, isObj, num, str } from "./util";

export function normalizeOracleRequest(raw: RawOracleRequest): OracleRequest {
  const w = isObj(raw.window) ? raw.window : {};
  const answer = raw.consensus_answer;
  return {
    id: str(raw.id) ?? "unknown",
    status: (str(raw.status) ?? "unknown").toLowerCase(),
    question: str(raw.question) ?? "",
    questionHash: str(raw.questionHash),
    chainId: num(raw.chainId),
    window: {
      fromBlock: num(w.fromBlock),
      toBlock: num(w.toBlock),
      toBlockHash: str(w.toBlockHash),
    },
    answerType: str(raw.answerType),
    evidence: str(raw.evidence),
    panelSize: num(raw.panelSize),
    quorum: num(raw.quorum),
    validForSeconds: num(raw.validForSeconds),
    jobId: str(raw.jobId),
    signer: str(raw.signer),
    attestedAt: iso(raw.attestedAt),
    createdAt: iso(raw.createdAt),
    updatedAt: iso(raw.updatedAt),
    consensusAnswer: typeof answer === "boolean" ? (answer ? "true" : "false") : str(answer),
    consensusFigure: str(raw.consensus_figure),
    note: str(raw.note),
  };
}

export function normalizeOracleLedger(raw: RawOracleRequests): OracleLedger {
  const list = Array.isArray(raw.requests) ? raw.requests : [];
  return {
    count: num(raw.count),
    attester: str(raw.attester),
    requests: list.map(normalizeOracleRequest).filter((r) => r.id !== "unknown"),
  };
}

export function isAttested(r: OracleRequest): boolean {
  return r.status === "attested" || Boolean(r.attestedAt);
}

/** Resolution latency in seconds (created to attested). */
export function attestLatency(r: OracleRequest): number | null {
  if (!r.createdAt || !r.attestedAt) return null;
  return Math.max(0, (Date.parse(r.attestedAt) - Date.parse(r.createdAt)) / 1000);
}

const STOP = new Set(
  "the a an of to in on is are was were be by for and or what who how when which will does did do with at from this that it its as than about before after".split(" "),
);

export function keywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9$ ]+/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP.has(w)),
    ),
  );
}

/** Simple keyword overlap search over real attested IMD oracle questions. */
export function relatedRequests(query: string, requests: OracleRequest[], limit = 4): OracleRequest[] {
  const q = keywords(query);
  if (q.length === 0) return [];
  return requests
    .map((r) => {
      const k = new Set(keywords(r.question));
      const hits = q.filter((w) => k.has(w)).length;
      return { r, score: hits / Math.sqrt(k.size + 1) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
}
