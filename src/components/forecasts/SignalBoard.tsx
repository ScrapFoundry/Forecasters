import Link from "next/link";
import type { ForecastView } from "@/lib/forecasters/board";
import { forecastNumber } from "@/lib/forecasters/resolution";
import { Meter } from "@/components/ui/Meter";
import s from "./forecasts.module.css";

/** Aggregate network signal for a set of forecasts, rendered for a CRT. */
export function SignalBoard({ forecasts }: { forecasts: ForecastView[] }) {
  return (
    <div className={s.board}>
      {forecasts.map((f) => (
        <div className={s.boardRow} key={f.id}>
          <span>{forecastNumber(f.number)}</span>
          <span className={s.boardQ}>
            <Link href={`/forecasts/${f.id}`}>{f.question}</Link>
          </span>
          <Meter value={f.signal ? f.signal.confidence : null} width={18} />
          <span className={s.boardOut}>
            {f.signal?.outcome ?? "--"}
            {f.scenarioSignals ? ` ${String.fromCharCode(64 + (f.scenarioSignals.find((x) => x.signal === f.signal)?.index ?? 1))}` : ""}
          </span>
          <span className={s.boardN}>{f.signal ? `${(f.signal.confidence * 100).toFixed(1)}%` : "--"}</span>
        </div>
      ))}
    </div>
  );
}
