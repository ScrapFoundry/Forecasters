import type { AgentRecord, Forecast, Ledger, NetworkSignal, Prediction } from "./types";
import { computeRecords } from "./scoring";
import { signalForForecast } from "./consensus";
import { effectiveStatus } from "./resolution";
import { rankRecords } from "./rankings";

/** Serializable view of the ledger, safe to pass from server to client components. */
export interface ScenarioSignal {
  index: number;
  label: string;
  signal: NetworkSignal | null;
}

export interface ForecastView extends Forecast {
  /** plain questions: the signal. scenario questions: the plan with the highest P(YES). */
  signal: NetworkSignal | null;
  scenarioSignals: ScenarioSignal[] | null;
  participants: number;
}

export interface Board {
  source: Ledger["source"];
  error: string | null;
  generatedAt: string;
  forecasts: ForecastView[];
  records: AgentRecord[];
  totals: { forecasts: number; open: number; resolved: number; predictions: number; forecasters: number };
}

export function buildBoard(ledger: Ledger, now = Date.now()): Board {
  const recordsMap = computeRecords(ledger.forecasts, ledger.predictions);
  const agents = new Map<string, Set<string>>();
  for (const p of ledger.predictions) {
    const set = agents.get(p.forecastId) ?? new Set<string>();
    set.add(p.agentTokenId);
    agents.set(p.forecastId, set);
  }

  const forecasts: ForecastView[] = ledger.forecasts
    .map((f) => {
      const scenarioSignals = f.scenarios?.length
        ? f.scenarios.map((label, i) => ({ index: i + 1, label, signal: signalForForecast(f.id, ledger.predictions, recordsMap, i + 1) }))
        : null;
      const best = scenarioSignals?.reduce<ScenarioSignal | null>((b, x) => (x.signal && (!b?.signal || x.signal.pYes > b.signal.pYes) ? x : b), null);
      return {
        ...f,
        status: effectiveStatus(f, now),
        signal: scenarioSignals ? best?.signal ?? null : signalForForecast(f.id, ledger.predictions, recordsMap),
        scenarioSignals,
        participants: agents.get(f.id)?.size ?? 0,
      };
    })
    .sort((a, b) => {
      const rank = (s: Forecast["status"]) => (s === "OPEN" ? 0 : s === "CLOSED" ? 1 : s === "RESOLVED" ? 2 : 3);
      return rank(a.status) - rank(b.status) || (a.status === "OPEN" ? Date.parse(a.deadline) - Date.parse(b.deadline) : Date.parse(b.deadline) - Date.parse(a.deadline));
    });

  const records = rankRecords(Array.from(recordsMap.values()));

  return {
    source: ledger.source,
    error: ledger.error,
    generatedAt: ledger.generatedAt,
    forecasts,
    records,
    totals: {
      forecasts: forecasts.length,
      open: forecasts.filter((f) => f.status === "OPEN").length,
      resolved: forecasts.filter((f) => f.status === "RESOLVED").length,
      predictions: ledger.predictions.length,
      forecasters: records.length,
    },
  };
}

export function predictionsFor(ledger: Ledger, forecastId: string): Prediction[] {
  return ledger.predictions.filter((p) => p.forecastId === forecastId).sort((a, b) => Math.abs(b.pYes - 0.5) - Math.abs(a.pYes - 0.5));
}

/** Swarm overlay derived from the ledger: who is forecasting, who was right on the latest resolution. */
export function swarmOverlay(ledger: Ledger, now = Date.now()) {
  const open = new Set(ledger.forecasts.filter((f) => effectiveStatus(f, now) === "OPEN").map((f) => f.id));
  const closed = new Set(ledger.forecasts.filter((f) => effectiveStatus(f, now) === "CLOSED").map((f) => f.id));
  const latest = ledger.forecasts
    .filter((f) => f.status === "RESOLVED" && f.result)
    .sort((a, b) => Date.parse(b.resolvedAt ?? b.deadline) - Date.parse(a.resolvedAt ?? a.deadline))[0];
  const forecasting = new Set<string>();
  const resolving = new Set<string>();
  const correct: string[] = [];
  const incorrect: string[] = [];
  for (const p of ledger.predictions) {
    if (open.has(p.forecastId)) forecasting.add(p.agentTokenId);
    if (closed.has(p.forecastId)) resolving.add(p.agentTokenId);
    if (latest && p.forecastId === latest.id) {
      if (latest.scenarios?.length && (p.scenario ?? 0) !== latest.realizedScenario) continue;
      ((p.pYes >= 0.5 ? "YES" : "NO") === latest.result ? correct : incorrect).push(p.agentTokenId);
    }
  }
  return {
    forecasting: Array.from(forecasting),
    resolving: Array.from(resolving),
    correct,
    incorrect,
    demo: ledger.source === "demo",
    latestResolved: latest ? { id: latest.id, number: latest.number, question: latest.question, result: latest.result } : null,
  };
}
