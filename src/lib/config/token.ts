import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TOKEN / LAUNCH CONFIG, read at RUNTIME (no rebuild, no restart).
 *
 * On the VPS the value is re-read from the `.env` file every few seconds, so
 * pasting TOKEN_ADDRESS into .env is enough: within a minute the site shows the
 * CA and the worker launches the pipeline. On Vercel (no file) it falls back to
 * process.env.
 *
 *   TOKEN_ADDRESS   contract address (empty = pre-launch)
 *   TOKEN_SYMBOL    optional, e.g. FCST
 *   TOKEN_CHAIN_ID  default 1 (Ethereum mainnet)
 */

export interface TokenConfig {
  address: string | null;
  symbol: string | null;
  chainId: number;
  live: boolean;
  explorerUrl: string | null;
  chartUrl: string | null;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
let cache: { at: number; value: TokenConfig } | null = null;

function fromFile(): Record<string, string> {
  try {
    const text = readFileSync(join(process.cwd(), ".env"), "utf8");
    const out: Record<string, string> = {};
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(TOKEN_[A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1]) out[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "").trim();
    }
    return out;
  } catch {
    return {};
  }
}

const CHAINS: Record<number, { explorer: string; dex: string }> = {
  1: { explorer: "https://etherscan.io/token/", dex: "https://dexscreener.com/ethereum/" },
  8453: { explorer: "https://basescan.org/token/", dex: "https://dexscreener.com/base/" },
};

export function tokenConfig(): TokenConfig {
  if (cache && Date.now() - cache.at < 5_000) return cache.value;
  const file = fromFile();
  const pick = (k: string) => (k in file ? file[k] : process.env[k]) || "";
  const raw = pick("TOKEN_ADDRESS").trim();
  const address = ADDRESS.test(raw) ? raw : null;
  const chainId = Number(pick("TOKEN_CHAIN_ID") || "1") || 1;
  const chain = CHAINS[chainId];
  const value: TokenConfig = {
    address,
    symbol: pick("TOKEN_SYMBOL").replace(/^\$/, "").trim().slice(0, 12) || null,
    chainId,
    live: Boolean(address),
    explorerUrl: address && chain ? `${chain.explorer}${address}` : null,
    chartUrl: address && chain ? `${chain.dex}${address}` : null,
  };
  cache = { at: Date.now(), value };
  return value;
}
