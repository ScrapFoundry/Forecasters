import "server-only";

const bool = (v: string | undefined, d = false) => (v === undefined || v === "" ? d : v === "true" || v === "1");
const int = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

/** Server only configuration. Never import this from a client component. */
export const serverConfig = {
  imdApiUrl: (process.env.IMD_API_URL || "https://api.imd.fun").replace(/\/+$/, ""),
  imdExplorerUrl: (process.env.IMD_EXPLORER_URL || "https://explorer.imd.fun").replace(/\/+$/, ""),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  /** IMD request timeout. The UI degrades instead of waiting forever. */
  imdTimeoutMs: 6000,

  /* ---------------- paid IMD requests ---------------- */
  /** Master switch. When false, every paid call stops before signing anything. */
  paymentsEnabled: bool(process.env.IMD_PAYMENTS_ENABLED, false),
  /** 32 byte bearer secret (64 hex). Identifies our orders at IMD; keep it stable. */
  imdBearerToken: process.env.IMD_BEARER_TOKEN || "",
  /** Dedicated hot wallet that pays IMD. NOT the creator / treasury wallet. */
  operatorPrivateKey: process.env.OPERATOR_PRIVATE_KEY || "",
  ethRpcUrl: process.env.ETH_RPC_URL || "",
  /** Hard cap on IMD spent per UTC day. */
  dailyBudgetImd: int(process.env.IMD_DAILY_BUDGET, 4),
  /** Expected IMD token and price; payment is refused if IMD asks for anything else. */
  imdToken: (process.env.IMD_TOKEN_ADDRESS || "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7").toLowerCase(),
  maxPricePerAction: process.env.IMD_MAX_PRICE_WEI || "500000000000000000",

  /* ---------------- forecast pipeline ---------------- */
  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5-mini",
  questionsPerDay: int(process.env.FORECASTS_PER_DAY, 3),
  /** How many of the daily questions are Snowmoon ch.27 decision questions (2 or 3 plans). */
  decisionsPerDay: int(process.env.DECISIONS_PER_DAY, 1),
  /** auto: generated questions go straight to the pipeline. review: they wait in the operator panel. */
  generateMode: (process.env.GENERATE_MODE === "review" ? "review" : "auto") as "auto" | "review",
  /** Forecasters requested per question (steps of one fan out job). */
  forecastPanel: Math.min(5, Math.max(1, int(process.env.FORECAST_PANEL, 3))),
  /** IMD oracle panel used to resolve each question. IMD minimum is 5. */
  oraclePanel: Math.min(100, Math.max(5, int(process.env.ORACLE_PANEL, 7))),
  oracleQuorum: int(process.env.ORACLE_QUORUM, 5),

  /* ---------------- operator + cron auth ---------------- */
  /** Public address allowed into /operator (signature login). */
  operatorAddress: (process.env.OPERATOR_ADDRESS || "").toLowerCase(),
  sessionSecret: process.env.OPERATOR_SESSION_SECRET || "",
  cronSecret: process.env.CRON_SECRET || "",
} as const;

export const hasSupabase = (): boolean => Boolean(serverConfig.supabaseUrl && serverConfig.supabaseServiceKey);

export const hasPayer = (): boolean =>
  Boolean(serverConfig.operatorPrivateKey && serverConfig.imdBearerToken && /^[0-9a-f]{64}$/i.test(serverConfig.imdBearerToken));

export const hasGenerator = (): boolean => Boolean(serverConfig.openaiKey);
