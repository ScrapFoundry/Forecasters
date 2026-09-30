/**
 * IMD data model.
 *
 * Raw* types mirror what https://api.imd.fun returns (read only endpoints).
 * Every field is treated as optional at the edge because the API is external:
 * the normalizers in this folder turn raw payloads into strict shapes and use
 * `null` for anything the API did not provide. The UI renders `null` as UNKNOWN.
 */

/* ------------------------------------------------------------------ */
/* Raw API payloads                                                    */
/* ------------------------------------------------------------------ */

export interface RawSwarmHealth {
  reachable?: boolean;
  agentsOnline?: number;
  workingNow?: number;
  acceptedLastDay?: number;
  jobsDoneLastDay?: number;
  oraclesDoneLastDay?: number;
  seatsEnrolled?: number;
  pendingVerification?: number;
  pendingDeployment?: number;
  pendingSites?: number;
  verifierUp?: boolean;
  publisherUp?: boolean;
  deployerUp?: boolean;
}

export interface RawSwarmCounts {
  jobs?: number;
  jobStates?: Record<string, number>;
  tasksInProgress?: number;
  launchesLive?: number;
  sites?: number;
  inferenceTokens?: number;
  events?: number;
}

export interface RawSwarmSeat {
  tokenId?: number | string;
  agentId?: string | number;
  attempts?: number;
  accepted?: number;
  rejected?: number;
  failed?: number;
  pending?: number;
  last?: string | null;
  working?: boolean;
  queued?: number;
}

export interface RawSwarm {
  at?: number | string;
  health?: RawSwarmHealth;
  counts?: RawSwarmCounts;
  seats?: Record<string, RawSwarmSeat> | RawSwarmSeat[];
  events?: unknown;
  owners?: unknown;
}

export interface RawJob {
  id?: string;
  state?: string;
  template?: string | null;
  objective?: string | null;
  originalRequest?: unknown;
  blockedReason?: string | null;
  delivery?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

export interface RawJobs {
  count?: number;
  jobs?: RawJob[];
}

export interface RawOracleWindow {
  fromBlock?: number;
  toBlock?: number;
  toBlockHash?: string;
}

export interface RawOracleRequest {
  id?: string;
  status?: string;
  question?: string;
  questionHash?: string;
  chainId?: number;
  window?: RawOracleWindow;
  answerType?: string;
  evidence?: string;
  panelSize?: number;
  quorum?: number;
  validForSeconds?: number;
  jobId?: string;
  signer?: string;
  attestedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  consensus_answer?: string | number | boolean | null;
  consensus_encoding?: string | null;
  consensus_figure?: number | string | null;
  note?: string | null;
}

export interface RawOracleRequests {
  count?: number;
  attester?: string;
  requests?: RawOracleRequest[];
}

export interface RawAgentRegistration {
  agentId?: number | string;
  agentRegistry?: string;
  chainId?: number;
  tokenContract?: string;
  tokenId?: string;
}

export interface RawAgentCard {
  type?: string;
  name?: string;
  description?: string;
  image?: string;
  services?: { name?: string; endpoint?: string }[];
  active?: boolean;
  x402Support?: boolean;
  supportedTrust?: string[];
  registrations?: RawAgentRegistration[];
  enrolled?: boolean;
}

export interface RawRuntime {
  id?: string;
  version?: string;
  premiumModel?: { model?: string; effort?: string } | null;
}

export interface RawSeatWork {
  jobId?: string;
  objective?: string;
  jobState?: string;
  nodeKey?: string;
  role?: string;
  status?: string;
  submittedAt?: string;
}

export interface RawSeat {
  tokenId?: string;
  agentId?: string;
  chainId?: number;
  collection?: string;
  adapter?: string;
  status?: string;
  owner?: string;
  ownership?: string;
  pairedAt?: string;
  online?: boolean;
  daemonVersion?: string;
  runtimes?: RawRuntime[];
  devices?: number;
  attempts?: number;
  accepted?: number;
  rejected?: number;
  failed?: number;
  pending?: number;
  work?: RawSeatWork[];
}

export interface RawSeatStanding {
  tokenId?: string;
  at?: string;
  server?: { version?: string; presenceWindowMs?: number };
  devices?: number;
  enrollment?: {
    status?: string;
    tokenId?: string;
    agentId?: string;
    registered?: boolean;
    pairedAt?: string;
    lastSeenAt?: string;
  };
  presence?: {
    connected?: boolean;
    acceptingWork?: boolean;
    connectedAt?: string;
    lastHeartbeatAt?: string;
    heartbeatAgeMs?: number;
    stale?: boolean;
    daemonVersion?: string;
    runtimes?: RawRuntime[];
    kinds?: string[];
    profiles?: string[];
    tools?: string[];
    skills?: string[];
    maxConcurrency?: number;
    platform?: { os?: string; arch?: string; nodeVersion?: string };
  };
  standing?: {
    consecutiveFailures?: number;
    lastFailedAt?: string | null;
    pausedUntil?: string | null;
    pausedFor?: string | null;
    working?: number;
    running?: unknown[];
    recentFailures?: unknown[];
  };
  queue?: {
    ready?: number;
    fleetOnline?: number;
    eligible?: number;
    blocked?: unknown[];
  };
}

export interface RawSeatRecords {
  count?: number;
  seats?: {
    tokenId?: string;
    agentId?: string;
    attempts?: number;
    accepted?: number;
    rejected?: number;
    failed?: number;
    pending?: number;
    lastWorkedAt?: string | null;
  }[];
}

export interface RawSeatOwners {
  chainId?: number;
  collection?: string;
  at?: string;
  count?: number;
  holders?: number;
  owners?: string[];
}

/* ------------------------------------------------------------------ */
/* Normalized shapes used by the app                                   */
/* ------------------------------------------------------------------ */

/** Result envelope for every IMD read. Never throws to the UI. */
export type ImdResult<T> =
  | { ok: true; data: T; fetchedAt: number; source: "imd" }
  | { ok: false; data: null; error: string; fetchedAt: number; source: "imd" };

/** Derived from `last` activity in /swarm. IMD does not expose per seat presence in the list. */
export type SeatActivity = "WORKING" | "ACTIVE" | "IDLE" | "DORMANT" | "UNKNOWN";

export interface SwarmSeat {
  tokenId: string;
  agentId: string | null;
  attempts: number | null;
  accepted: number | null;
  rejected: number | null;
  failed: number | null;
  pending: number | null;
  queued: number | null;
  working: boolean;
  lastActivityAt: string | null;
  activity: SeatActivity;
}

export interface SwarmHealth {
  reachable: boolean | null;
  agentsOnline: number | null;
  workingNow: number | null;
  acceptedLastDay: number | null;
  jobsDoneLastDay: number | null;
  oraclesDoneLastDay: number | null;
  seatsEnrolled: number | null;
  pendingVerification: number | null;
  pendingDeployment: number | null;
  pendingSites: number | null;
  verifierUp: boolean | null;
  publisherUp: boolean | null;
  deployerUp: boolean | null;
}

export interface SwarmCounts {
  jobs: number | null;
  jobStates: Record<string, number>;
  tasksInProgress: number | null;
  launchesLive: number | null;
  sites: number | null;
  inferenceTokens: number | null;
  events: number | null;
}

export interface Swarm {
  at: string | null;
  health: SwarmHealth;
  counts: SwarmCounts;
  seats: SwarmSeat[];
  /** Totals computed from the seat map. */
  totals: {
    seats: number;
    attempts: number;
    accepted: number;
    rejected: number;
    failed: number;
    pending: number;
    workingSeats: number;
    activeSeats: number;
  };
}

export type JobState = "executing" | "completed" | "blocked" | "cancelled" | "queued" | "planning" | string;

export interface Job {
  id: string;
  state: JobState;
  template: string | null;
  kind: string;
  objective: string | null;
  blockedReason: string | null;
  deliveryUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OracleRequest {
  id: string;
  status: string;
  question: string;
  questionHash: string | null;
  chainId: number | null;
  window: { fromBlock: number | null; toBlock: number | null; toBlockHash: string | null };
  answerType: string | null;
  evidence: string | null;
  panelSize: number | null;
  quorum: number | null;
  validForSeconds: number | null;
  jobId: string | null;
  signer: string | null;
  attestedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  consensusAnswer: string | null;
  consensusFigure: string | null;
  note: string | null;
}

export interface OracleLedger {
  count: number | null;
  attester: string | null;
  requests: OracleRequest[];
}

export interface Runtime {
  id: string;
  version: string | null;
  model: string | null;
  effort: string | null;
}

export interface SeatWork {
  jobId: string | null;
  objective: string | null;
  jobState: string | null;
  nodeKey: string | null;
  role: string | null;
  status: string | null;
  submittedAt: string | null;
}

export interface AgentDossier {
  tokenId: string;
  identity: {
    name: string | null;
    description: string | null;
    active: boolean | null;
    enrolled: boolean | null;
    agentId: string | null;
    registry: string | null;
    tokenContract: string | null;
    chainId: number | null;
    explorerUrl: string | null;
    supportedTrust: string[];
  } | null;
  seat: {
    status: string | null;
    owner: string | null;
    ownership: string | null;
    pairedAt: string | null;
    online: boolean | null;
    daemonVersion: string | null;
    devices: number | null;
    runtimes: Runtime[];
    attempts: number | null;
    accepted: number | null;
    rejected: number | null;
    failed: number | null;
    pending: number | null;
    work: SeatWork[];
  } | null;
  standing: {
    connected: boolean | null;
    acceptingWork: boolean | null;
    stale: boolean | null;
    lastHeartbeatAt: string | null;
    heartbeatAgeMs: number | null;
    maxConcurrency: number | null;
    kinds: string[];
    skills: string[];
    consecutiveFailures: number | null;
    pausedUntil: string | null;
    working: number | null;
    fleetOnline: number | null;
    platform: string | null;
  } | null;
  /** Which of the three IMD reads succeeded. */
  sources: { identity: boolean; seat: boolean; standing: boolean };
}

/** Event derived from real IMD timestamps. `kind` drives color and icon. */
export interface NetworkEvent {
  id: string;
  at: string;
  kind: "seat" | "job-posted" | "job-completed" | "job-blocked" | "oracle-called" | "oracle-attested";
  text: string;
  ref: string | null;
}
