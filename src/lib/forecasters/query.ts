import type { NetworkSignal, Tier } from "./types";
import type { OracleRequest } from "@/lib/imd/types";

export interface SelectedForecaster {
  tokenId: string;
  /** accuracy (forecast basis) or verified work rate (work basis) */
  metric: number | null;
  resolved: number;
  correct: number;
  recent: number;
  tier: Tier;
}

export interface ScenarioResult {
  label: string;
  predictions: { tokenId: string; pYes: number }[];
  signal: NetworkSignal | null;
}

export interface Dissent {
  tokenId: string;
  kind: "OPPOSES" | "UNMOVED";
  detail: string;
}

export interface OracleQueryResponse {
  question: string;
  basis: "FORECAST RECORD" | "FORECAST RECORD (DEMO DATA)" | "VERIFIED WORK RECORD (LIVE IMD)" | "UNAVAILABLE";
  selected: SelectedForecaster[];
  /** single question (no scenarios): same shape as one scenario */
  predictions: { tokenId: string; pYes: number }[];
  signal: NetworkSignal | null;
  /** Chapter 27 mode: the same outcome under several plans */
  scenarios: ScenarioResult[];
  dissent: Dissent[];
  /** true when predictions come from the simulator, never from agents */
  simulated: boolean;
  dispatch: "NOT CONNECTED" | "CONNECTED";
  related: OracleRequest[];
  imd: { swarm: boolean; oracle: boolean };
  at: string;
}

/**
 * Dissent, as in the chapter 27 scene: the forecaster who stays put while the
 * others move, or who sits on the other side of the network signal.
 */
export function findDissent(scenarios: ScenarioResult[]): Dissent[] {
  const out: Dissent[] = [];
  const valid = scenarios.filter((s) => s.signal);
  if (valid.length === 0) return out;
  const ids = [...new Set(valid.flatMap((s) => s.predictions.map((p) => p.tokenId)))];

  for (const id of ids) {
    const per = valid.map((s) => ({ s, p: s.predictions.find((x) => x.tokenId === id)?.pYes })).filter((x): x is { s: ScenarioResult; p: number } => typeof x.p === "number");
    const opposes = per.filter(({ s, p }) => Math.abs(p - s.signal!.pYes) >= 0.2 && (p >= 0.5) !== (s.signal!.pYes >= 0.5));
    if (opposes.length > 0) {
      out.push({ tokenId: id, kind: "OPPOSES", detail: opposes.map(({ s, p }) => `${s.label}: ${Math.round(p * 100)}% vs network ${Math.round(s.signal!.pYes * 100)}%`).join(" · ") });
    }
    if (valid.length > 1 && per.length === valid.length) {
      const own = Math.max(...per.map((x) => x.p)) - Math.min(...per.map((x) => x.p));
      const net = Math.max(...valid.map((s) => s.signal!.pYes)) - Math.min(...valid.map((s) => s.signal!.pYes));
      if (net >= 0.08 && own <= net * 0.3) {
        out.push({ tokenId: id, kind: "UNMOVED", detail: `moves ${Math.round(own * 100)} pts across plans while the network moves ${Math.round(net * 100)}` });
      }
    }
  }
  return out;
}
