import Link from "next/link";
import type { Dissent, ScenarioResult } from "@/lib/forecasters/query";
import { Meter } from "@/components/ui/Meter";
import s from "@/components/ui/page.module.css";

/**
 * Chapter 27 decision board: the same outcome under several plans, the
 * network signal for each, every forecaster's number, and who dissents.
 */
export function ScenarioBoard({ scenarios, dissent }: { scenarios: ScenarioResult[]; dissent: Dissent[] }) {
  const ids = [...new Set(scenarios.flatMap((x) => x.predictions.map((p) => p.tokenId)))];
  const best = scenarios.reduce<ScenarioResult | null>((b, x) => (x.signal && (!b?.signal || x.signal.pYes > b.signal.pYes) ? x : b), null);
  const flagged = new Map(dissent.map((d) => [d.tokenId, d.kind]));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className={s.termLines}>
        <span style={{ letterSpacing: "0.18em" }}>DECISION BOARD // P(YES) PER PLAN</span>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {scenarios.map((x, i) => (
          <div key={x.label} style={{ display: "grid", gridTemplateColumns: "3ch minmax(0,1fr) auto 7ch", gap: 12, alignItems: "center", fontSize: 13 }}>
            <span style={{ opacity: 0.6 }}>{String.fromCharCode(65 + i)}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>IF {x.label.toUpperCase()}</span>
            <Meter value={x.signal?.pYes ?? null} width={18} tone={x === best ? "ph" : "muted"} />
            <span style={{ textAlign: "right", fontSize: 16, fontWeight: x === best ? 600 : 400 }}>{x.signal ? `${Math.round(x.signal.pYes * 100)}%` : "--"}</span>
          </div>
        ))}
      </div>

      {ids.length ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
            <thead>
              <tr style={{ opacity: 0.6, textAlign: "left" }}>
                <th style={{ padding: "4px 8px 6px 0", fontWeight: 400 }}>FORECASTER</th>
                {scenarios.map((_, i) => (
                  <th key={i} style={{ padding: "4px 8px 6px", fontWeight: 400, textAlign: "right" }}>
                    {String.fromCharCode(65 + i)}
                  </th>
                ))}
                <th style={{ padding: "4px 0 6px 8px", fontWeight: 400 }}>NOTE</th>
              </tr>
            </thead>
            <tbody>
              {ids.map((id) => (
                <tr key={id} style={{ borderTop: "1px solid rgba(57,255,106,0.12)", color: flagged.has(id) ? "var(--warn)" : undefined }}>
                  <td style={{ padding: "6px 8px 6px 0" }}>
                    <Link href={`/agents/${id}`} style={{ textDecoration: "underline" }}>
                      #{id}
                    </Link>
                  </td>
                  {scenarios.map((x, i) => {
                    const p = x.predictions.find((y) => y.tokenId === id)?.pYes;
                    return (
                      <td key={i} style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {typeof p === "number" ? `${Math.round(p * 100)}%` : "--"}
                      </td>
                    );
                  })}
                  <td style={{ padding: "6px 0 6px 8px" }}>{flagged.get(id) ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {best?.signal ? (
        <div className={s.termLines}>
          <span>
            &gt; HIGHEST ODDS: IF {best.label.toUpperCase()} ({Math.round(best.signal.pYes * 100)}%)
          </span>
          <span style={{ opacity: 0.7 }}>&gt; A SIGNAL PER PLAN, NOT A RECOMMENDATION. THE DECISION STAYS WITH YOU.</span>
        </div>
      ) : null}
    </div>
  );
}

export function DissentList({ dissent }: { dissent: Dissent[] }) {
  if (dissent.length === 0) return <span style={{ opacity: 0.7 }}>&gt; NO DISSENT: THE FORECASTERS BROADLY AGREE.</span>;
  return (
    <div className={s.termLines}>
      {dissent.map((d) => (
        <span key={`${d.tokenId}-${d.kind}`} style={{ color: "var(--warn)", textShadow: "none" }}>
          &gt; DISSENT #{d.tokenId} {d.kind}: {d.detail}
        </span>
      ))}
    </div>
  );
}
