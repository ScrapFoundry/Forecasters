import { Meter } from "@/components/ui/Meter";
import s from "./forecasts.module.css";

/** YES / NO block meters for a probability of YES. */
export function ProbabilityBars({ pYes, width = 20 }: { pYes: number | null; width?: number }) {
  if (pYes === null) {
    return (
      <div className={s.bars}>
        <div className={s.barRow}>
          <span>YES</span>
          <Meter value={null} width={width} tone="muted" />
          <span className={s.pct}>--</span>
        </div>
        <div className={s.barRow}>
          <span>NO</span>
          <Meter value={null} width={width} tone="muted" />
          <span className={s.pct}>--</span>
        </div>
      </div>
    );
  }
  const yesLead = pYes >= 0.5;
  return (
    <div className={s.bars}>
      <div className={[s.barRow, yesLead ? s.lead : ""].join(" ")}>
        <span>YES</span>
        <Meter value={pYes} width={width} tone={yesLead ? "ph" : "muted"} />
        <span className={s.pct}>{Math.round(pYes * 100)}%</span>
      </div>
      <div className={[s.barRow, !yesLead ? s.lead : ""].join(" ")}>
        <span>NO</span>
        <Meter value={1 - pYes} width={width} tone={!yesLead ? "ph" : "muted"} />
        <span className={s.pct}>{Math.round((1 - pYes) * 100)}%</span>
      </div>
    </div>
  );
}
