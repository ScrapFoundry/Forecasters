"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLive } from "@/components/shell/LiveDataProvider";
import { useNow } from "@/components/shell/useNow";
import type { AgentRecord } from "@/lib/forecasters/types";
import type { SeatActivity } from "@/lib/imd/types";
import { verifiedRate, decidedCount } from "@/lib/imd/seats";
import { fmtAgo } from "@/lib/format";
import { Notice } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { AgentCard } from "./AgentCard";
import s from "./agents.module.css";
import f from "@/components/forecasts/forecasts.module.css";

type Filter = "ALL" | "WORKING" | "ACTIVE" | "FORECASTING";
type Sort = "ACTIVITY" | "VERIFIED" | "ATTEMPTS" | "TOKEN";

const ORDER: Record<SeatActivity, number> = { WORKING: 0, ACTIVE: 1, IDLE: 2, DORMANT: 3, UNKNOWN: 4 };

export function AgentGrid({ records, demo }: { records: AgentRecord[]; demo: boolean }) {
  const live = useLive();
  const now = useNow(15_000);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<Sort>("ACTIVITY");
  const [limit, setLimit] = useState(60);
  const recMap = useMemo(() => new Map(records.map((r) => [r.tokenId, r])), [records]);
  const seats = live.swarm.data?.seats;

  const list = useMemo(() => {
    if (!seats) return [];
    let out = seats;
    const term = q.trim().replace(/^#/, "");
    if (term) out = out.filter((x) => x.tokenId.startsWith(term) || x.agentId?.startsWith(term));
    if (filter === "WORKING") out = out.filter((x) => x.activity === "WORKING");
    if (filter === "ACTIVE") out = out.filter((x) => x.activity === "WORKING" || x.activity === "ACTIVE");
    if (filter === "FORECASTING") out = out.filter((x) => (recMap.get(x.tokenId)?.forecasts ?? 0) > 0);
    const sorted = [...out];
    if (sort === "ACTIVITY")
      sorted.sort((a, b) => ORDER[a.activity] - ORDER[b.activity] || (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""));
    if (sort === "VERIFIED")
      sorted.sort((a, b) => (verifiedRate(b) ?? -1) - (verifiedRate(a) ?? -1) || decidedCount(b) - decidedCount(a));
    if (sort === "ATTEMPTS") sorted.sort((a, b) => (b.attempts ?? 0) - (a.attempts ?? 0));
    if (sort === "TOKEN") sorted.sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
    return sorted;
  }, [seats, q, filter, sort, recMap]);

  const status = live.status("swarm", now);

  if (!seats) {
    return status === "OFFLINE" || status === "DEGRADED" ? (
      <Notice title="IMD CONNECTION ○ DEGRADED" tone="err">
        AGENT DATA UNAVAILABLE. {live.swarm.error ?? ""} RETRYING AUTOMATICALLY.
      </Notice>
    ) : (
      <Notice title="SYNCING WITH IMD">MAPPING SEATS FROM /SWARM</Notice>
    );
  }

  return (
    <>
      <div className={s.toolbar}>
        <div className={f.filters} style={{ marginBottom: 0 }}>
          {(["ALL", "WORKING", "ACTIVE", "FORECASTING"] as Filter[]).map((k) => (
            <button key={k} type="button" className={f.filter} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k === "ACTIVE" ? "ACTIVE 6H" : k}
            </button>
          ))}
        </div>
        <div className={f.filters} style={{ marginBottom: 0 }}>
          <label className={s.search}>
            <Search size={13} aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="TOKEN ID" inputMode="numeric" aria-label="search token id" />
          </label>
          {(["ACTIVITY", "VERIFIED", "ATTEMPTS", "TOKEN"] as Sort[]).map((k) => (
            <button key={k} type="button" className={f.filter} aria-pressed={sort === k} onClick={() => setSort(k)}>
              SORT {k}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <Notice title="NO MATCHING AGENTS" />
      ) : (
        <div className={s.grid}>
          {list.slice(0, limit).map((seat) => (
            <AgentCard
              key={seat.tokenId}
              seat={seat}
              record={recMap.get(seat.tokenId)}
              demo={demo}
              nowLabel={now ? (seat.lastActivityAt ? fmtAgo(seat.lastActivityAt, now) : "NO WORK") : ""}
            />
          ))}
        </div>
      )}
      {list.length > limit ? (
        <div className={s.more}>
          <Button variant="ghost" onClick={() => setLimit((l) => l + 60)}>
            [ LOAD {Math.min(60, list.length - limit)} MORE OF {list.length - limit} ]
          </Button>
        </div>
      ) : null}
    </>
  );
}
