"use client";

import { useLive, type FeedStatus } from "./LiveDataProvider";
import { useNow } from "./useNow";
import { fmtAgo } from "@/lib/format";
import { publicConfig } from "@/lib/config/public";
import s from "./shell.module.css";

const glyph = (st: FeedStatus) => (st === "ONLINE" ? "●" : st === "SYNCING" ? "◌" : "○");
const tone = (st: FeedStatus) => (st === "ONLINE" ? s.okTone : st === "SYNCING" || st === "STALE" ? s.warnTone : s.errTone);

/**
 * Persistent status strip. Failures are always visible, never hidden.
 * RESOLUTION ENGINE reflects the forecast ledger source (see LedgerSourceTag).
 */
export function StatusBar({ ledgerSource }: { ledgerSource: "supabase" | "demo" | "none" }) {
  const live = useLive();
  const now = useNow(1000);
  const imd = live.status("swarm", now);
  const oracle = live.status("oracle", now);
  const feed = live.status("jobs", now);
  const lastSync = live.swarm.lastSuccess;

  const imdLabel = imd === "OFFLINE" || imd === "DEGRADED" ? "DEGRADED" : imd;
  const engine: FeedStatus = ledgerSource === "supabase" ? "ONLINE" : ledgerSource === "demo" ? "STALE" : "OFFLINE";
  const engineLabel = ledgerSource === "supabase" ? "ONLINE" : ledgerSource === "demo" ? "DEMO" : "NO LEDGER";

  return (
    <div className={s.status} role="status" aria-live="polite">
      <div className={s.statusInner}>
        <span className={s.statusTitle}>FORECASTERS NETWORK</span>
        <span className={tone(imd)}>
          {glyph(imd)} IMD {imdLabel}
        </span>
        <span className={tone(oracle)}>
          {glyph(oracle)} ORACLE {oracle === "OFFLINE" || oracle === "DEGRADED" ? "DEGRADED" : oracle}
        </span>
        <span className={tone(engine)}>
          {glyph(engine)} RESOLUTION ENGINE {engineLabel}
        </span>
        <span className={tone(feed)}>
          {glyph(feed)} DATA FEED {feed === "OFFLINE" || feed === "DEGRADED" ? "DEGRADED" : feed}
        </span>
        <span className={s.statusSync}>
          {now === 0 ? "LAST SYNC --" : lastSync ? `LAST SYNC ${fmtAgo(lastSync, now)}` : live.swarm.failures > 0 ? "NO SUCCESSFUL SYNC" : "SYNCING"}
        </span>
        {publicConfig.demoMode ? <span className={s.statusDemo}>DEMO MODE</span> : null}
      </div>
    </div>
  );
}
