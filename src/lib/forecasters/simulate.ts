import type { SelectedForecaster } from "./query";

/**
 * SIMULATOR (demo mode only)
 *
 * Deterministic pseudo predictions derived from hashes of the question, the
 * scenario and the agent id. Each simulated agent also has a fixed
 * "sensitivity" to scenarios, so some react strongly to a change of plan and
 * some barely move. Output is always labeled SIMULATED and never stored.
 */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const unit = (s: string) => (hash(s) % 10_000) / 10_000;

export function simulatePredictions(question: string, agents: SelectedForecaster[], scenario = ""): { tokenId: string; pYes: number }[] {
  const q = question.toLowerCase().trim();
  const base = 0.2 + unit(q) * 0.6;
  const shift = scenario ? (unit(`${q}|${scenario.toLowerCase()}`) - 0.5) * 0.5 : 0;
  return agents.map((a) => {
    const sensitivity = 0.1 + unit(`sens:${a.tokenId}`) * 0.9;
    const bias = (unit(`${a.tokenId}:${q}`) - 0.5) * 0.3;
    const p = Math.min(0.95, Math.max(0.05, base + bias + shift * sensitivity));
    return { tokenId: a.tokenId, pYes: Math.round(p * 1000) / 1000 };
  });
}
