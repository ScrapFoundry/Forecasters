"use client";

import Link from "next/link";
import { useLive } from "@/components/shell/LiveDataProvider";
import { rankSeatsByWork } from "@/lib/forecasters/rankings";
import { decidedCount, verifiedRate } from "@/lib/imd/seats";
import { fmtPct } from "@/lib/format";
import { Meter } from "@/components/ui/Meter";
import s from "./agents.module.css";

/** Live leaders by the verified work record IMD publishes (not a forecast record). */
export function WorkLeaders({ limit = 8 }: { limit?: number }) {
  const live = useLive();
  const seats = live.swarm.data?.seats;
  if (!seats) {
    return <div style={{ color: "var(--ph-2)", fontSize: 12 }}>&gt; {live.swarm.failures > 0 ? "DATA UNAVAILABLE" : "SYNCING..."}</div>;
  }
  const top = rankSeatsByWork(seats, 50).slice(0, limit);
  return (
    <div className={s.leaders}>
      {top.map((seat, i) => (
        <div className={s.leader} key={seat.tokenId}>
          <span className={s.dim}>{String(i + 1).padStart(2, "0")}</span>
          <Link href={`/agents/${seat.tokenId}`}>#{seat.tokenId}</Link>
          <Meter value={verifiedRate(seat)} width={16} />
          <span>{fmtPct(verifiedRate(seat))}</span>
          <span className={s.dim}>{decidedCount(seat)} DEC</span>
        </div>
      ))}
    </div>
  );
}
