import "server-only";
import OpenAI from "openai";
import { serverConfig } from "@/lib/config/server";
import { keywords } from "@/lib/imd/oracle";
import { CATEGORIES, type ForecastCategory } from "./types";

/**
 * QUESTION GENERATOR (OpenAI)
 *
 * The model only proposes questions. It never predicts and never resolves.
 * Every question must be binary, have a deadline, and be answerable later by
 * an IMD oracle panel with answerType bool, so reality can score it.
 */

export interface GeneratedQuestion {
  question: string;
  category: ForecastCategory;
  deadlineHours: number;
  resolutionCriteria: string;
  oracleQuestion: string;
  source: string;
  /** Snowmoon ch.27: 2 or 3 mutually exclusive plans, or empty for a plain question */
  scenarios?: string[];
  /** past tense question answered with the number of the plan that happened (1..n) */
  conditionQuestion?: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "category", "deadlineHours", "resolutionCriteria", "oracleQuestion", "source", "scenarios", "conditionQuestion"],
        properties: {
          question: { type: "string", description: "Future tense yes/no question, max 160 chars, ends with ?" },
          category: { type: "string", enum: CATEGORIES },
          deadlineHours: { type: "integer", description: "Hours from now until the outcome is known, 24 to 336" },
          resolutionCriteria: { type: "string", description: "Exact rule that makes the answer YES, including the data source" },
          oracleQuestion: {
            type: "string",
            description: "Past tense version asked after the deadline, answerable true/false by researchers, with explicit dates in UTC",
          },
          source: { type: "string", enum: ["MARKET DATA", "IMD API", "ON CHAIN READ", "PUBLIC RECORD"] },
          scenarios: {
            type: "array",
            maxItems: 3,
            items: { type: "string" },
            description: "Empty for a plain question. For a decision question: 2 or 3 mutually exclusive plans or conditions, each publicly verifiable by the deadline.",
          },
          conditionQuestion: {
            type: "string",
            description: "Empty for a plain question. Otherwise a past tense question, with UTC dates, whose answer is which plan actually happened.",
          },
        },
      },
    },
  },
} as const;

function systemPrompt(now: Date): string {
  return [
    "You write forecasting questions for FORECASTERS, a network that measures how well AI agents predict reality.",
    `Current time: ${now.toISOString()} (UTC).`,
    "Rules:",
    "1. Binary YES/NO questions about events that are genuinely uncertain today (roughly 20 to 80 percent likely).",
    "2. The outcome must be publicly verifiable after the deadline from a named source: market prices, Ethereum mainnet data, the public IMD API (api.imd.fun), or major public records.",
    "3. Deadline between 24 and 336 hours from now. Put the exact UTC date and time in both questions.",
    "4. Prefer crypto markets, Ethereum on chain metrics, the IMD agent network itself (jobs, oracle requests, agents online), technology releases and major public events.",
    "5. No questions about private individuals, violence, deaths, elections, the health of named people, or anything illegal.",
    "6. No ambiguity: thresholds are numbers, sources are named, time zones are UTC.",
    "6b. After the deadline, the past tense oracleQuestion (and conditionQuestion) must be answerable by researchers from public sources. The IMD oracle refuses questions about the future, opinions, or non public facts.",
    "7. Do not repeat or paraphrase any of the recent questions provided.",
    "8. Some questions are DECISION questions, as in the Snowmoon chapter 27 scene: the same outcome estimated under 2 or 3 mutually exclusive plans or conditions (for example: whether a scheduled vote passes, whether a rate is cut or held). Exactly one plan must be publicly known to have happened by the deadline. Put the plans in `scenarios` and a past tense `conditionQuestion` that identifies which one happened. Plain questions use an empty `scenarios` array and an empty `conditionQuestion`.",
  ].join("\n");
}

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

function similar(a: string, b: string): boolean {
  const ka = new Set(keywords(a));
  const kb = new Set(keywords(b));
  if (ka.size === 0 || kb.size === 0) return false;
  const inter = [...ka].filter((k) => kb.has(k)).length;
  return inter / Math.min(ka.size, kb.size) > 0.7;
}

export function validateQuestion(q: GeneratedQuestion, recent: string[]): string | null {
  if (q.question.length < 12 || q.question.length > 200 || !q.question.endsWith("?")) return "question length / format";
  if (!CATEGORIES.includes(q.category)) return "category";
  if (!Number.isInteger(q.deadlineHours) || q.deadlineHours < 24 || q.deadlineHours > 336) return "deadline window";
  if (q.oracleQuestion.length < 12 || q.oracleQuestion.length > 1500) return "oracle question";
  if (q.resolutionCriteria.length < 10) return "resolution criteria";
  if (recent.some((r) => similar(r, q.question))) return "duplicate of a recent question";
  const plans = q.scenarios ?? [];
  if (plans.length === 1 || plans.length > 3) return "scenarios must be 0, 2 or 3";
  if (plans.some((x) => x.length < 3 || x.length > 140)) return "scenario length";
  if (new Set(plans.map((x) => x.toLowerCase())).size !== plans.length) return "duplicate scenarios";
  if (plans.length && (q.conditionQuestion ?? "").length < 12) return "missing condition question";
  return null;
}

export async function generateQuestions(count: number, recent: string[], now = new Date(), decisionCount = 0): Promise<{ accepted: GeneratedQuestion[]; rejected: { q: string; reason: string }[]; model: string }> {
  if (!serverConfig.openaiKey) throw new Error("OPENAI_API_KEY is not set");
  const client = new OpenAI({ apiKey: serverConfig.openaiKey });
  const res = await client.responses.create({
    model: serverConfig.openaiModel,
    input: [
      { role: "system", content: systemPrompt(now) },
      {
        role: "user",
        content: `Write ${count + 2} candidate questions. ${decisionCount > 0 ? `At least ${decisionCount + 1} of them must be DECISION questions with scenarios.` : "All of them plain questions (empty scenarios)."} Recent questions to avoid:\n${recent.slice(0, 60).map((r) => `- ${r}`).join("\n") || "(none)"}`,
      },
    ],
    text: { format: { type: "json_schema", name: "forecast_questions", schema: SCHEMA as unknown as Record<string, unknown>, strict: true } },
  });

  let parsed: { questions?: GeneratedQuestion[] } = {};
  try {
    parsed = JSON.parse(res.output_text) as { questions?: GeneratedQuestion[] };
  } catch {
    throw new Error("generator returned invalid JSON");
  }

  const accepted: GeneratedQuestion[] = [];
  const rejected: { q: string; reason: string }[] = [];
  const seen = [...recent];
  for (const raw of parsed.questions ?? []) {
    const q: GeneratedQuestion = {
      question: clean(raw.question, 200),
      category: raw.category,
      deadlineHours: Math.round(raw.deadlineHours),
      resolutionCriteria: clean(raw.resolutionCriteria, 800),
      oracleQuestion: clean(raw.oracleQuestion, 1500),
      source: clean(raw.source, 40),
      scenarios: (Array.isArray(raw.scenarios) ? raw.scenarios : []).map((x) => clean(String(x), 140)).filter(Boolean),
      conditionQuestion: clean(raw.conditionQuestion ?? "", 1500),
    };
    const why = validateQuestion(q, seen);
    if (why) {
      rejected.push({ q: q.question, reason: why });
      continue;
    }
    accepted.push(q);
    seen.push(q.question);
  }
  // keep the requested mix: decision questions first up to decisionCount, then plain ones
  if (decisionCount > 0) {
    const decisions = accepted.filter((q) => q.scenarios?.length);
    const plain = accepted.filter((q) => !q.scenarios?.length);
    accepted.splice(0, accepted.length, ...decisions.slice(0, decisionCount), ...plain, ...decisions.slice(decisionCount));
  }
  accepted.length = Math.min(accepted.length, count);
  return { accepted, rejected, model: serverConfig.openaiModel };
}
