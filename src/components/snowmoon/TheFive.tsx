import Link from "next/link";
import type { AgentRecord } from "@/lib/forecasters/types";
import { InstrumentPanel, Screen } from "@/components/ui/InstrumentPanel";
import { Badge } from "@/components/ui/Badge";
import { fmtPct } from "@/lib/format";
import s from "./protocol.module.css";

/** The five forecasters a Chapter 27 query would go to right now. */
export function TheFive({ five, models, demo }: { five: AgentRecord[]; models: Record<string, string | null>; demo: boolean }) {
  if (five.length === 0) {
    return <div style={{ fontSize: 12, color: "var(--muted)" }}>&gt; NO RESOLVED FORECASTS YET. THE LEADERBOARD FILLS AS REALITY RESOLVES QUESTIONS.</div>;
  }
  return (
    <div className={s.five}>
      {five.map((r, i) => (
        <InstrumentPanel key={r.tokenId} label={`FORECASTER ${i + 1} OF 5`} code={demo ? "DEMO" : "LIVE"}>
          <Link href={`/agents/${r.tokenId}`} className={s.seatId}>
            IMD #{r.tokenId}
          </Link>
          <Screen>
            <div className={s.seatScore}>{r.score === null ? "--" : r.score.toFixed(0)}</div>
            <div className={s.seat}>
              <span>PREDICTION SCORE</span>
              <span>
                {r.correct}/{r.resolved} CORRECT · {fmtPct(r.accuracy, 0)}
              </span>
            </div>
          </Screen>
          <div className={s.seat} style={{ color: "var(--hw-ink-2)" }}>
            <span>MODEL {models[r.tokenId]?.toUpperCase() ?? "UNKNOWN"}</span>
            <Badge tone="ink">{r.tier}</Badge>
          </div>
        </InstrumentPanel>
      ))}
    </div>
  );
}
