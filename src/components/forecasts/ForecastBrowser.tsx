"use client";

import { useMemo, useState } from "react";
import type { ForecastView } from "@/lib/forecasters/board";
import { CATEGORIES } from "@/lib/forecasters/types";
import { ForecastCard } from "./ForecastCard";
import { Notice } from "@/components/ui/SectionHeader";
import s from "./forecasts.module.css";
import m from "@/components/monitors/monitors.module.css";

const STATUSES = ["ALL", "OPEN", "CLOSED", "RESOLVED"] as const;

export function ForecastBrowser({ forecasts }: { forecasts: ForecastView[] }) {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("OPEN");
  const [cat, setCat] = useState<string>("ALL");
  const [limit, setLimit] = useState(18);
  const list = useMemo(
    () => forecasts.filter((f) => (status === "ALL" || f.status === status) && (cat === "ALL" || f.category === cat)),
    [forecasts, status, cat],
  );
  return (
    <>
      <div className={s.filters}>
        {STATUSES.map((k) => (
          <button key={k} type="button" className={s.filter} aria-pressed={status === k} onClick={() => setStatus(k)}>
            {k} ({k === "ALL" ? forecasts.length : forecasts.filter((f) => f.status === k).length})
          </button>
        ))}
        <span style={{ width: 12 }} />
        {["ALL", ...CATEGORIES].map((k) => (
          <button key={k} type="button" className={s.filter} aria-pressed={cat === k} onClick={() => setCat(k)}>
            {k}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Notice title="NO FORECASTS MATCH THIS FILTER" />
      ) : (
        <div className={m.cards}>
          {list.slice(0, limit).map((f) => (
            <ForecastCard key={f.id} f={f} />
          ))}
        </div>
      )}
      {list.length > limit ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <button type="button" className={s.filter} onClick={() => setLimit((l) => l + 18)}>
            [ LOAD MORE // {list.length - limit} REMAINING ]
          </button>
        </div>
      ) : null}
    </>
  );
}
