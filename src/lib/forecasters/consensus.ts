import type { AgentRecord, NetworkSignal, Prediction, SignalContribution } from "./types";
import { confidenceOf, outcomeOf } from "./types";

/**
 * NETWORK SIGNAL
 *
 * A weighted mean of each participant's probability of YES:
 *
 *   shrunk_accuracy_i = (correct_i + 1) / (resolved_i + 2)       Laplace prior
 *   reliability_i     = resolved_i / (resolved_i + K)            K = 10
 *   weight_i          = max(shrunk_accuracy_i - 0.5, 0) * reliability_i + FLOOR
 *   p_yes             = sum(weight_i * p_i) / sum(weight_i)
 *
 * Agents with no resolved history get only the FLOOR weight, so a newcomer
 * is heard but cannot dominate. The output is a signal, not a verdict:
 * reality resolves the forecast later and the signal is scored like anyone else.
 */

export const CONSENSUS_K = 10;
export const CONSENSUS_FLOOR = 0.02;

export const CONSENSUS_METHOD =
  "p_yes = sum(w_i * p_i) / sum(w_i);  w_i = max((c_i+1)/(r_i+2) - 0.5, 0) * r_i/(r_i+10) + 0.02";

export function weightFor(rec: Pick<AgentRecord, "correct" | "resolved"> | undefined): number {
  if (!rec || rec.resolved <= 0) return CONSENSUS_FLOOR;
  const shrunk = (rec.correct + 1) / (rec.resolved + 2);
  const reliability = rec.resolved / (rec.resolved + CONSENSUS_K);
  return Math.max(shrunk - 0.5, 0) * reliability + CONSENSUS_FLOOR;
}

export interface ConsensusInput {
  tokenId: string;
  pYes: number;
  record?: Pick<AgentRecord, "correct" | "resolved" | "accuracy">;
}

export function aggregate(inputs: ConsensusInput[]): NetworkSignal | null {
  const valid = inputs.filter((i) => Number.isFinite(i.pYes) && i.pYes >= 0 && i.pYes <= 1);
  if (valid.length === 0) return null;

  const contributions: SignalContribution[] = valid.map((i) => ({
    tokenId: i.tokenId,
    pYes: i.pYes,
    weight: weightFor(i.record),
    accuracy: i.record?.accuracy ?? null,
    resolved: i.record?.resolved ?? 0,
  }));

  const wSum = contributions.reduce((s, c) => s + c.weight, 0);
  const pYes = contributions.reduce((s, c) => s + c.weight * c.pYes, 0) / wSum;
  const yes = contributions.filter((c) => c.pYes >= 0.5).length;

  contributions.sort((a, b) => b.weight - a.weight);

  return {
    outcome: outcomeOf(pYes),
    confidence: confidenceOf(pYes),
    pYes,
    participants: contributions.length,
    yes,
    no: contributions.length - yes,
    contributions,
    method: CONSENSUS_METHOD,
  };
}

export function signalForForecast(
  forecastId: string,
  predictions: Prediction[],
  records: Map<string, AgentRecord>,
  scenario = 0,
): NetworkSignal | null {
  return aggregate(
    predictions
      .filter((p) => p.forecastId === forecastId && (p.scenario ?? 0) === scenario)
      .map((p) => ({ tokenId: p.agentTokenId, pYes: p.pYes, record: records.get(p.agentTokenId) })),
  );
}
