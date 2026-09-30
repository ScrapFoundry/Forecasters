import Link from "next/link";
import type { AgentRecord } from "@/lib/forecasters/types";
import { fmtPct, fmtSigned } from "@/lib/format";
import s from "./forecasts.module.css";

export function TierTag({ tier }: { tier: "ACOLYTE" | "SENTINEL" | "KEEPER" }) {
  const cls = tier === "SENTINEL" ? s.sentinel : tier === "KEEPER" ? s.keeper : "";
  return <span className={[s.tier, cls].join(" ")}>{tier}</span>;
}

/** Institutional record: forecasts, resolved, accuracy, recent, status. */
export function RecordTable({
  records,
  limit,
  showScore = true,
  models,
}: {
  records: AgentRecord[];
  limit?: number;
  showScore?: boolean;
  /** seat -> AI model (live IMD). Shows the open competition between AIs (Snowmoon ch.32). */
  models?: Record<string, string | null>;
}) {
  const rows = typeof limit === "number" ? records.slice(0, limit) : records;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.rank}>#</th>
            <th>AGENT</th>
            {models ? <th>MODEL</th> : null}
            <th className={s.num}>FORECASTS</th>
            <th className={s.num}>RESOLVED</th>
            <th className={s.num}>CORRECT</th>
            <th className={s.num}>ACCURACY</th>
            {showScore ? <th className={s.num}>SCORE</th> : null}
            <th className={s.num}>RECENT</th>
            <th>STATUS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.tokenId}>
              <td className={s.rank}>{String(i + 1).padStart(2, "0")}</td>
              <td>
                <Link href={`/agents/${r.tokenId}`} className={s.agentId}>
                  #{r.tokenId}
                </Link>
              </td>
              {models ? <td style={{ color: "var(--muted)", fontSize: 11 }}>{models[r.tokenId]?.toUpperCase() ?? "--"}</td> : null}
              <td className={s.num}>{r.forecasts}</td>
              <td className={s.num}>{r.resolved}</td>
              <td className={s.num}>{r.correct}</td>
              <td className={s.num}>{fmtPct(r.accuracy)}</td>
              {showScore ? <td className={s.num}>{r.score === null ? "--" : r.score.toFixed(0)}</td> : null}
              <td className={[s.num, r.recent > 0 ? s.pos : r.recent < 0 ? s.neg : ""].join(" ")}>{fmtSigned(r.recent)}</td>
              <td>
                <TierTag tier={r.tier} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
