"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import s from "./token.module.css";

interface Token {
  address: string | null;
  symbol: string | null;
  chainId: number;
  live: boolean;
  explorerUrl: string | null;
  chartUrl: string | null;
}

let shared: Promise<Token | null> | null = null;
let sharedAt = 0;
function loadToken(): Promise<Token | null> {
  if (!shared || Date.now() - sharedAt > 30_000) {
    sharedAt = Date.now();
    shared = fetch("/api/token", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Token>) : null))
      .catch(() => null);
  }
  return shared;
}

/** Contract address with copy + explorer links. Shows "NOT LIVE YET" until TOKEN_ADDRESS is set. */
export function TokenCA({ variant = "inline" }: { variant?: "inline" | "hero" | "compact" }) {
  const [t, setT] = useState<Token | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () => void loadToken().then((x) => alive && setT(x));
    tick();
    const id = setInterval(tick, 30_000); // picks up a CA pasted into .env without reload
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const cls = [s.ca, s[variant]].join(" ");
  if (!t) return <span className={cls} aria-hidden />;
  if (!t.live || !t.address) {
    return (
      <span className={cls}>
        <span className={s.label}>CA</span>
        <span className={s.pending}>NOT LIVE YET</span>
      </span>
    );
  }
  const short = `${t.address.slice(0, 6)}...${t.address.slice(-4)}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(t.address!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <span className={cls}>
      <span className={s.label}>{t.symbol ? `$${t.symbol} CA` : "CA"}</span>
      <button type="button" className={s.addr} onClick={copy} title="Copy contract address" aria-label="copy contract address">
        <span className={s.full}>{t.address}</span>
        <span className={s.short}>{short}</span>
        {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
      </button>
      {variant !== "compact" && t.explorerUrl ? (
        <a className={s.link} href={t.explorerUrl} target="_blank" rel="noopener noreferrer">
          EXPLORER <ExternalLink size={10} aria-hidden />
        </a>
      ) : null}
      {variant !== "compact" && t.chartUrl ? (
        <a className={s.link} href={t.chartUrl} target="_blank" rel="noopener noreferrer">
          CHART <ExternalLink size={10} aria-hidden />
        </a>
      ) : null}
    </span>
  );
}
