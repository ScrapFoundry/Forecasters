/** Values safe to ship to the browser. */
export const publicConfig = {
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
  imdUrl: process.env.NEXT_PUBLIC_IMD_URL || "https://imd.fun",
  explorerUrl: "https://explorer.imd.fun",
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || "",
  xUrl: process.env.NEXT_PUBLIC_X_URL || "",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || "1"),
} as const;

/**
 * Polling cadence per feed (ms). One provider owns every timer, so no component
 * polls IMD on its own. Values stay inside the 5 to 15 second window.
 */
export const POLL = {
  swarm: 10_000,
  jobs: 15_000,
  oracle: 15_000,
  ledger: 30_000,
} as const;

/** A feed is STALE when its last success is older than this multiple of its interval. */
export const STALE_FACTOR = 3;
