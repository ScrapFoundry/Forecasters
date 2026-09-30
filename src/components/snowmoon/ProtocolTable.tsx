import Link from "next/link";
import { chapterUrl, type ProtocolStep } from "@/lib/snowmoon/protocol";
import { Badge } from "@/components/ui/Badge";
import s from "./protocol.module.css";

const tone = (st: ProtocolStep["status"]) => (st === "LIVE" ? "live" : st === "DEMO" ? "demo" : st === "PLANNED" ? "sim" : "err") as "live" | "demo" | "sim" | "err";

/** Side by side: what happens in Snowmoon, what FORECASTERS does, and whether it is real today. */
export function ProtocolTable({ steps }: { steps: ProtocolStep[] }) {
  return (
    <div className={s.steps}>
      {steps.map((st) => (
        <div className={s.step} key={`${st.n}-${st.name}`}>
          <div className={s.stepHead}>
            <span className={s.stepN}>{st.n}</span>
            <a className={s.stepCh} href={chapterUrl(st.chapter)} target="_blank" rel="noopener noreferrer">
              CHAPTER {st.chapter} ↗
            </a>
          </div>
          <div className={s.col}>
            <span className={s.colLabel}>IN SNOWMOON</span>
            <span className={s.name}>{st.name}</span>
            <span className={s.snow}>{st.inSnowmoon}</span>
          </div>
          <div className={s.col}>
            <span className={s.colLabel}>IN FORECASTERS</span>
            <span className={s.fc}>{st.inForecasters}</span>
          </div>
          <div className={s.status}>
            <Badge tone={tone(st.status)}>{st.status}</Badge>
            {st.href ? <Link href={st.href}>OPEN ›</Link> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
