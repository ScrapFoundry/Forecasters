/**
 * FORECASTERS domain model.
 *
 * The concepts are deliberately separate and never collapsed into one
 * "AI score":
 *
 *   AGENT          an IMD seat, identified by tokenId (IMD is the source of truth)
 *   FORECAST       a question with a deadline and a resolution method
 *   PREDICTION     one agent's probability on one forecast
 *   OUTCOME        what reality did (YES / NO)
 *   EVIDENCE       why we believe the outcome
 *   SCORE          per agent metrics computed from resolved predictions
 *   NETWORK SIGNAL a weighted aggregate of predictions, never a verdict
 */

export type Outcome = "YES" | "NO";

export type ForecastStatus = "OPEN" | "CLOSED" | "RESOLVED" | "VOID";

export type ForecastCategory = "CRYPTO" | "MARKETS" | "ONCHAIN" | "TECHNOLOGY" | "GENERAL";

export const CATEGORIES: ForecastCategory[] = ["CRYPTO", "MARKETS", "ONCHAIN", "TECHNOLOGY", "GENERAL"];

/** Where a ledger row came from. The UI labels anything that is not "supabase". */
export type LedgerSource = "supabase" | "demo" | "none";

export interface Evidence {
  label: string;
  url: string | null;
  note: string | null;
  /** True only when a KEEPER (resolver) verified the evidence. */
  verified: boolean;
}

export interface Forecast {
  id: string;
  /** Display number, e.g. 491 -> "#00491". */
  number: number;
  question: string;
  category: ForecastCategory;
  source: string;
  resolutionMethod: string;
  createdAt: string;
  deadline: string;
  status: ForecastStatus;
  result: Outcome | null;
  evidence: Evidence | null;
  resolvedAt: string | null;
  demo: boolean;
  /**
   * Snowmoon ch.27 scenario question: the same outcome under 2 or 3 plans.
   * Forecasters give one probability per plan; only the plan that actually
   * happened (`realizedScenario`, 1-based) is scored. null = plain question.
   */
  scenarios?: string[] | null;
  realizedScenario?: number | null;
  /** Present for forecasts run through the paid IMD pipeline. */
  pipeline?: {
    state: string;
    generatedBy: string;
    criteria: string | null;
    forecastJobId: string | null;
    oracleRequestId: string | null;
  } | null;
}

export interface Prediction {
  id: string;
  forecastId: string;
  agentTokenId: string;
  /** Probability that the answer is YES, 0..1. Outcome and confidence derive from it. */
  pYes: number;
  /** 0 = plain question, 1..3 = plan A..C of a scenario question */
  scenario?: number;
  submittedAt: string;
  rationale: string | null;
  demo: boolean;
}

export interface Ledger {
  source: LedgerSource;
  forecasts: Forecast[];
  predictions: Prediction[];
  generatedAt: string;
  error: string | null;
}

export type Tier = "ACOLYTE" | "SENTINEL";

export interface AgentRecord {
  tokenId: string;
  forecasts: number;
  resolved: number;
  correct: number;
  incorrect: number;
  /** correct / resolved, null when resolved = 0 */
  accuracy: number | null;
  /** mean (pYes - y)^2 over resolved predictions, lower is better */
  brier: number | null;
  /** 100 * (1 - brier). Shown with its formula wherever it appears. */
  score: number | null;
  /** |mean stated confidence - accuracy|, lower is better calibrated */
  calibrationGap: number | null;
  meanConfidence: number | null;
  /** correct minus incorrect over the last RECENT_WINDOW resolved predictions */
  recent: number;
  /** positive = consecutive correct, negative = consecutive incorrect */
  streak: number;
  categories: Partial<Record<ForecastCategory, { resolved: number; correct: number }>>;
  tier: Tier;
  lastPredictionAt: string | null;
}

export interface SignalContribution {
  tokenId: string;
  pYes: number;
  weight: number;
  accuracy: number | null;
  resolved: number;
}

export interface NetworkSignal {
  outcome: Outcome;
  /** max(pYes, 1 - pYes) of the aggregate */
  confidence: number;
  pYes: number;
  participants: number;
  yes: number;
  no: number;
  contributions: SignalContribution[];
  method: string;
}

export const scenarioLetter = (i: number): string => String.fromCharCode(64 + i); // 1 -> A

export const outcomeOf = (pYes: number): Outcome => (pYes >= 0.5 ? "YES" : "NO");
export const confidenceOf = (pYes: number): number => Math.max(pYes, 1 - pYes);
