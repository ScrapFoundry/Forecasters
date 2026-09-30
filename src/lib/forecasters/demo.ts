import type { Forecast, ForecastCategory, Ledger, Outcome, Prediction } from "./types";

/**
 * DEMO LEDGER
 *
 * Seeded, deterministic sample forecasts used only when NEXT_PUBLIC_DEMO_MODE
 * is true and no Supabase ledger is configured. Every row carries demo: true
 * and the UI labels it DEMO DATA. Token ids reference real IMD seats only as
 * placeholders; these agents did NOT make these predictions.
 */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_AGENTS = [
  "1599", "127", "1", "849", "1959", "652", "1565", "398", "61", "153",
  "12", "404", "777", "1024", "250", "311", "905", "1440", "88", "1203",
  "506", "1777", "33", "690", "1111", "240", "1834", "72",
] as const;

/** Latent skill per demo agent, used only to make the demo track record non uniform. */
const skillOf = (i: number) => 0.93 - (i / DEMO_AGENTS.length) * 0.36;

interface Seed {
  q: string;
  cat: ForecastCategory;
  source: string;
  method: string;
  /** hours from anchor; negative = in the past */
  deadlineH: number;
  result?: Outcome;
  evidence?: string;
  /** latent probability for open questions */
  lean?: number;
  /** Snowmoon ch.27 decision question */
  plans?: string[];
  planLeans?: number[];
  realized?: number;
}

const OPEN: Seed[] = [
  {
    q: "Will the IMD swarm complete more than 60 jobs in the next 24 hours?",
    cat: "ONCHAIN",
    source: "IMD API",
    method: "IMD API",
    deadlineH: 20,
    plans: ["nothing changes", "the job price drops to 0.25 IMD", "100 more seats enroll this week"],
    planLeans: [0.34, 0.58, 0.49],
  },
  {
    q: "Will ETH close the first week of October above $3,000?",
    cat: "CRYPTO",
    source: "MARKET DATA",
    method: "MARKET DATA",
    deadlineH: 110,
    plans: ["the Fed cuts rates at its next meeting", "the Fed holds rates"],
    planLeans: [0.66, 0.42],
  },
  { q: "Will ETH trade above $3,000 before October 1?", cat: "CRYPTO", source: "MARKET DATA", method: "MARKET DATA", deadlineH: 8.7, lean: 0.72 },
  { q: "Will BTC touch $85,000 before October 1?", cat: "CRYPTO", source: "MARKET DATA", method: "MARKET DATA", deadlineH: 30, lean: 0.66 },
  { q: "Will the IMD swarm attest more than 60 oracle requests in the next 24 hours?", cat: "ONCHAIN", source: "IMD API", method: "IMD API", deadlineH: 22, lean: 0.58 },
  { q: "Will more than 500 IMD agents be online at the next daily snapshot?", cat: "ONCHAIN", source: "IMD API", method: "IMD API", deadlineH: 18, lean: 0.63 },
  { q: "Will Ethereum mainnet average base fee stay under 5 gwei this week?", cat: "ONCHAIN", source: "ON CHAIN READ", method: "ON CHAIN READ", deadlineH: 96, lean: 0.55 },
  { q: "Will a major lab ship a new frontier model before October 15?", cat: "TECHNOLOGY", source: "PUBLIC RECORD", method: "KEEPER REVIEW", deadlineH: 380, lean: 0.41 },
  { q: "Will the S&P 500 close the first week of October higher than it opened?", cat: "MARKETS", source: "MARKET DATA", method: "MARKET DATA", deadlineH: 120, lean: 0.54 },
];

const RESOLVED: Seed[] = [
  {
    q: "Will BTC close September above $80,000?",
    cat: "CRYPTO",
    source: "MARKET DATA",
    method: "MARKET DATA",
    deadlineH: -8,
    result: "YES",
    evidence: "Exchange close prices, monthly candle",
    plans: ["spot ETF net flows stay positive in the last week", "spot ETF net flows turn negative"],
    realized: 1,
  },
  { q: "Will ETH close September above its August close?", cat: "CRYPTO", source: "MARKET DATA", method: "MARKET DATA", deadlineH: -6, result: "YES", evidence: "Exchange close prices, monthly candle" },
  { q: "Will the IMD oracle attest 50 or more requests on September 24?", cat: "ONCHAIN", source: "IMD API", method: "IMD API", deadlineH: -120, result: "YES", evidence: "IMD /oracle/requests snapshot" },
  { q: "Will SOL flip BNB in market cap by September 20?", cat: "CRYPTO", source: "MARKET DATA", method: "MARKET DATA", deadlineH: -216, result: "NO", evidence: "Market cap ranking snapshot" },
  { q: "Will gas exceed 50 gwei at any point on September 22?", cat: "ONCHAIN", source: "ON CHAIN READ", method: "ON CHAIN READ", deadlineH: -168, result: "NO", evidence: "Block base fee scan" },
  { q: "Will any IMD seat pass 700 attempts by September 25?", cat: "ONCHAIN", source: "IMD API", method: "IMD API", deadlineH: -96, result: "YES", evidence: "IMD /seats/records snapshot" },
  { q: "Will a major code host report an outage longer than one hour in September?", cat: "TECHNOLOGY", source: "PUBLIC RECORD", method: "KEEPER REVIEW", deadlineH: -30, result: "NO", evidence: "Public status page history" },
];

/** Archive: generic resolved questions so the demo track record has depth. */
function archive(rand: () => number): Seed[] {
  const assets = ["ETH", "BTC", "SOL"];
  const out: Seed[] = [];
  for (let i = 0; i < 30; i++) {
    const kind = i % 5;
    const day = 3 + Math.floor(i / 2);
    const res: Outcome = rand() > 0.47 ? "YES" : "NO";
    const a = assets[i % assets.length] ?? "ETH";
    let s: Seed;
    if (kind === 0) s = { q: `Will ${a} close higher on day ${day} than on day ${day - 1} of the cycle?`, cat: "CRYPTO", source: "MARKET DATA", method: "MARKET DATA", deadlineH: -(day * 24 + 240), result: res };
    else if (kind === 1) s = { q: `Will IMD complete more than 40 jobs in window ${String(i).padStart(2, "0")}?`, cat: "ONCHAIN", source: "IMD API", method: "IMD API", deadlineH: -(day * 24 + 240), result: res };
    else if (kind === 2) s = { q: `Will the index close green in session ${String(i).padStart(2, "0")}?`, cat: "MARKETS", source: "MARKET DATA", method: "MARKET DATA", deadlineH: -(day * 24 + 240), result: res };
    else if (kind === 3) s = { q: `Will the release candidate ${String(i).padStart(2, "0")} ship on schedule?`, cat: "TECHNOLOGY", source: "PUBLIC RECORD", method: "KEEPER REVIEW", deadlineH: -(day * 24 + 240), result: res };
    else s = { q: `Will public question ${String(i).padStart(2, "0")} resolve YES by its deadline?`, cat: "GENERAL", source: "PUBLIC RECORD", method: "KEEPER REVIEW", deadlineH: -(day * 24 + 240), result: res };
    s.evidence = "Archived demo evidence";
    out.push(s);
  }
  return out;
}

let cache: { anchor: number; ledger: Ledger } | null = null;

export function demoLedger(now = Date.now()): Ledger {
  const anchor = Math.floor(now / 3_600_000) * 3_600_000;
  if (cache && cache.anchor === anchor) return cache.ledger;

  const rand = mulberry32(0x5eed1e);
  const seeds = [...OPEN, ...RESOLVED, ...archive(rand)];
  const forecasts: Forecast[] = [];
  const predictions: Prediction[] = [];
  const H = 3_600_000;

  seeds.forEach((s, idx) => {
    const number = 520 - idx;
    const id = `demo-${number}`;
    const deadline = new Date(anchor + s.deadlineH * H).toISOString();
    const createdAt = new Date(anchor + (s.deadlineH - 72 - rand() * 72) * H).toISOString();
    const resolved = Boolean(s.result);
    forecasts.push({
      id,
      number,
      question: s.q,
      category: s.cat,
      source: s.source,
      resolutionMethod: s.method,
      createdAt,
      deadline,
      status: resolved ? "RESOLVED" : "OPEN",
      result: s.result ?? null,
      evidence: resolved
        ? { label: `DEMO EVIDENCE: ${s.evidence ?? "sample"}`, url: null, note: "Seeded sample. Not a real source.", verified: true }
        : null,
      resolvedAt: resolved ? new Date(anchor + (s.deadlineH + 2) * H).toISOString() : null,
      demo: true,
      scenarios: s.plans ?? null,
      realizedScenario: s.plans ? s.realized ?? null : null,
    });

    const participants = 12 + Math.floor(rand() * 20);
    const offset = Math.floor(rand() * DEMO_AGENTS.length);
    for (let k = 0; k < participants && k < DEMO_AGENTS.length; k++) {
      const ai = (offset + k * 5) % DEMO_AGENTS.length;
      const tokenId = DEMO_AGENTS[ai] ?? "1";
      if (s.plans) {
        const submittedAt = new Date(Date.parse(createdAt) + rand() * 48 * H).toISOString();
        const sens = 0.2 + rand() * 0.8; // how much this agent reacts to a change of plan
        s.plans.forEach((_, pi) => {
          let p: number;
          if (s.result && s.realized === pi + 1) {
            const correct = rand() < skillOf(ai);
            const conf = 0.52 + rand() * (0.25 + skillOf(ai) * 0.2);
            p = (s.result === "YES") === correct ? conf : 1 - conf;
          } else {
            const lean = s.planLeans?.[pi] ?? 0.5;
            const mean = (s.planLeans ?? [0.5]).reduce((a, b) => a + b, 0) / (s.planLeans?.length ?? 1);
            p = mean + (lean - mean) * sens + (rand() - 0.5) * 0.3 * (1.2 - skillOf(ai));
          }
          predictions.push({
            id: `${id}-${tokenId}-${pi + 1}`,
            forecastId: id,
            agentTokenId: tokenId,
            pYes: Math.round(Math.min(0.97, Math.max(0.03, p)) * 1000) / 1000,
            scenario: pi + 1,
            submittedAt,
            rationale: null,
            demo: true,
          });
        });
        continue;
      }
      let pYes: number;
      if (s.result) {
        const correct = rand() < skillOf(ai);
        const conf = 0.52 + rand() * (0.25 + skillOf(ai) * 0.2);
        const yes = (s.result === "YES") === correct;
        pYes = yes ? conf : 1 - conf;
      } else {
        const lean = s.lean ?? 0.5;
        pYes = Math.min(0.97, Math.max(0.03, lean + (rand() - 0.5) * 0.5 * (1.2 - skillOf(ai))));
      }
      predictions.push({
        id: `${id}-${tokenId}`,
        forecastId: id,
        agentTokenId: tokenId,
        pYes: Math.round(pYes * 1000) / 1000,
        scenario: 0,
        submittedAt: new Date(Date.parse(createdAt) + rand() * 48 * H).toISOString(),
        rationale: null,
        demo: true,
      });
    }
  });

  const ledger: Ledger = { source: "demo", forecasts, predictions, generatedAt: new Date(now).toISOString(), error: null };
  cache = { anchor, ledger };
  return ledger;
}
