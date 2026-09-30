import Link from "next/link";
import type { ForecastView } from "@/lib/forecasters/board";
import { forecastNumber } from "@/lib/forecasters/resolution";
import { Badge, DemoBadge } from "@/components/ui/Badge";
import { Meter } from "@/components/ui/Meter";
import type { ScenarioSignal } from "@/lib/forecasters/board";
import { ProbabilityBars } from "./ProbabilityBars";
import { Countdown } from "./Countdown";
import s from "./forecasts.module.css";

export function StatusText({ status }: { status: ForecastView["status"] }) {
  const cls = status === "OPEN" ? s.statusOpen : status === "CLOSED" ? s.statusClosed : s.statusResolved;
  return <span className={cls}>{status === "CLOSED" ? "CLOSED, AWAITING RESOLUTION" : status}</span>;
}

export function ForecastCard({ f }: { f: ForecastView }) {
  return (
    <article className={s.card}>
      <div className={s.cardTop}>
        <span>FORECAST {forecastNumber(f.number)} // {f.category}</span>
        <span className={s.cardTopRight}>
          {f.scenarioSignals ? <Badge tone="sim">CH.27 · {f.scenarioSignals.length} PLANS</Badge> : null}
          {f.demo ? <DemoBadge label="DEMO" /> : null}
        </span>
      </div>
      <h3 className={s.question}>
        <Link href={`/forecasts/${f.id}`} className={s.cardLink}>
          {f.question}
        </Link>
      </h3>
      {f.scenarioSignals ? <PlanBars plans={f.scenarioSignals} realized={f.realizedScenario ?? null} /> : <ProbabilityBars pYes={f.signal?.pYes ?? null} />}
      <div className={s.meta}>
        <span>
          FORECASTERS <b>{f.participants} AGENTS</b>
        </span>
        <span>
          {f.status === "RESOLVED" ? "RESULT" : "TIME"}
          <b>
            {f.status === "RESOLVED" ? (
              <span className={[s.result, f.result === "YES" ? s.yes : s.no].join(" ")}>{f.result}</span>
            ) : f.status === "OPEN" ? (
              <Countdown deadline={f.deadline} />
            ) : (
              "DEADLINE PASSED"
            )}
          </b>
        </span>
        <span>
          SOURCE <b>{f.source}</b>
        </span>
        <span>
          STATUS{" "}
          <b>
            <StatusText status={f.status} />
          </b>
        </span>
      </div>
    </article>
  );
}

/** Chapter 27 decision question: P(YES) under each plan. */
export function PlanBars({ plans, realized, width = 16 }: { plans: ScenarioSignal[]; realized: number | null; width?: number }) {
  const best = plans.reduce<ScenarioSignal | null>((b, x) => (x.signal && (!b?.signal || x.signal.pYes > b.signal.pYes) ? x : b), null);
  return (
    <div className={s.bars}>
      {plans.map((p) => (
        <div key={p.index} className={[s.barRow, p === best ? s.lead : ""].join(" ")} style={{ gridTemplateColumns: "3ch minmax(0,1fr) auto 5ch" }} title={p.label}>
          <span>{String.fromCharCode(64 + p.index)}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, opacity: realized && realized !== p.index ? 0.45 : 1 }}>
            {realized === p.index ? "● " : ""}IF {p.label.toUpperCase()}
          </span>
          <Meter value={p.signal?.pYes ?? null} width={width - 6} tone={p === best ? "ph" : "muted"} />
          <span className={s.pct}>{p.signal ? `${Math.round(p.signal.pYes * 100)}%` : "--"}</span>
        </div>
      ))}
    </div>
  );
}
