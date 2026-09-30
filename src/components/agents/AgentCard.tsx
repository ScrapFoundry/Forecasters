import Link from "next/link";
import type { SwarmSeat } from "@/lib/imd/types";
import type { AgentRecord } from "@/lib/forecasters/types";
import { StatusLED, type LedState } from "@/components/ui/StatusLED";
import { decidedCount, verifiedRate } from "@/lib/imd/seats";
import { fmtInt, fmtPct } from "@/lib/format";
import s from "./agents.module.css";

const ACT_LED: Record<SwarmSeat["activity"], LedState> = {
  WORKING: "on",
  ACTIVE: "on",
  IDLE: "idle",
  DORMANT: "off",
  UNKNOWN: "off",
};

/**
 * Agent instrument card. Top screen: VERIFIED WORK RECORD from IMD (live).
 * Bottom screen: FORECAST RECORD from the ledger (DEMO labeled when seeded).
 */
export function AgentCard({ seat, record, demo, nowLabel }: { seat: SwarmSeat; record?: AgentRecord; demo: boolean; nowLabel?: string }) {
  const rate = verifiedRate(seat);
  return (
    <article className={s.card}>
      <div className={s.cardHead}>
        <Link href={`/agents/${seat.tokenId}`}>IMD #{seat.tokenId}</Link>
        <StatusLED state={ACT_LED[seat.activity]} blink={seat.activity === "WORKING"} />
      </div>
      <div className={s.foot}>
        <span className={s.stateTag}>● {seat.activity === "ACTIVE" ? "ACTIVE 6H" : seat.activity}</span>
        <span>{nowLabel ?? ""}</span>
      </div>
      <div className={s.screen}>
        <span className={s.lbl}>VERIFIED WORK // IMD</span>
        <span className={rate === null ? s.unk : s.big}>{rate === null ? "NO DECIDED WORK" : fmtPct(rate)}</span>
        <span className={s.row}>
          <span>ATTEMPTS</span>
          <span>{fmtInt(seat.attempts)}</span>
        </span>
        <span className={s.row}>
          <span>ACCEPTED</span>
          <span>
            {fmtInt(seat.accepted)} / {decidedCount(seat)}
          </span>
        </span>
      </div>
      <div className={s.screen}>
        <span className={s.lbl}>FORECAST RECORD {demo ? "// DEMO" : ""}</span>
        {record && record.forecasts > 0 ? (
          <>
            <span className={s.row}>
              <span>ACCURACY</span>
              <span>{fmtPct(record.accuracy)}</span>
            </span>
            <span className={s.row}>
              <span>F / R / C</span>
              <span>
                {record.forecasts} / {record.resolved} / {record.correct}
              </span>
            </span>
          </>
        ) : (
          <span className={s.unk}>NO FORECASTS YET</span>
        )}
      </div>
    </article>
  );
}
