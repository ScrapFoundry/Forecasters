"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLive } from "@/components/shell/LiveDataProvider";
import { useNow } from "@/components/shell/useNow";
import { InstrumentPanel, Screen } from "@/components/ui/InstrumentPanel";
import { DigitalCounter } from "@/components/ui/DigitalCounter";
import { StatusLED, type LedState } from "@/components/ui/StatusLED";
import { AnalogGauge } from "@/components/ui/AnalogGauge";
import { SignalGraph } from "@/components/ui/SignalGraph";
import { MiniOscilloscope } from "@/components/ui/MiniOscilloscope";
import { Meter } from "@/components/ui/Meter";
import { Knob } from "@/components/ui/Knob";
import { DemoBadge } from "@/components/ui/Badge";
import { TerminalWindow } from "@/components/terminal/TerminalWindow";
import { TerminalLog } from "@/components/terminal/TerminalLog";
import { jobsHistogram } from "@/lib/imd/jobs";
import { attestLatency, isAttested } from "@/lib/imd/oracle";
import { fmtAgo, fmtClock, fmtCompact, fmtInt, fmtPct, UNKNOWN } from "@/lib/format";
import s from "./monitors.module.css";

export interface ForecastSummary {
  forecastingAgents: number;
  openForecasts: number;
  distribution: number[];
  demo: boolean;
  source: "supabase" | "demo" | "none";
}

const boolLed = (v: boolean | null): LedState => (v === null ? "idle" : v ? "on" : "err");

/**
 * The control room wall: metrics strip, central CRT and surrounding
 * instruments. Every IMD number comes from the live provider; forecast
 * numbers come from the ledger and carry a DEMO badge when seeded.
 */
export function ControlRoom({ forecast }: { forecast: ForecastSummary }) {
  const live = useLive();
  const now = useNow(1000);
  const sw = live.swarm.data;
  const jobs = live.jobs.data;
  const oracle = live.oracle.data;
  const swarmStatus = live.status("swarm", now);

  const derived = useMemo(() => {
    const requests = oracle?.requests ?? [];
    const attested = requests.filter(isAttested);
    const pendingOracles = requests.length ? requests.length - attested.length : null;
    const latencies = attested.map(attestLatency).filter((x): x is number => x !== null);
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
    const latest = attested[0] ?? requests[0] ?? null;
    const hist = jobs ? jobsHistogram(jobs, 24) : [];
    const seats = sw?.seats ?? [];
    const activity = {
      WORKING: seats.filter((x) => x.activity === "WORKING").length,
      ACTIVE: seats.filter((x) => x.activity === "ACTIVE").length,
      IDLE: seats.filter((x) => x.activity === "IDLE").length,
      DORMANT: seats.filter((x) => x.activity === "DORMANT").length,
    };
    const decided = sw ? sw.totals.accepted + sw.totals.rejected + sw.totals.failed : 0;
    const acceptRate = sw && decided > 0 ? sw.totals.accepted / decided : null;
    return { pendingOracles, avgLatency, latest, hist, activity, acceptRate, seatCount: seats.length };
  }, [oracle, jobs, sw]);

  const h = sw?.health;
  const online = h?.agentsOnline ?? null;
  const working = h?.workingNow ?? null;
  const workShare = online && working !== null ? working / online : null;
  const jobStates = sw?.counts.jobStates ?? {};
  const jobTotal = Object.values(jobStates).reduce((a, b) => a + b, 0);

  const statusText =
    swarmStatus === "ONLINE" ? "● ONLINE" : swarmStatus === "SYNCING" ? "◌ SYNCING" : swarmStatus === "STALE" ? "○ STALE" : "○ DEGRADED";

  return (
    <div className={s.rack}>
      {/* ---------------- LIVE SYSTEM METRICS ---------------- */}
      <div className={s.metrics}>
        <InstrumentPanel label="AGENTS ONLINE" code="M01" className={s.metric}>
          <DigitalCounter value={online} size="md" />
          <span className={s.metricSub}>
            <span>IMD /SWARM</span>
            <span>{h?.seatsEnrolled !== null && h?.seatsEnrolled !== undefined ? `${fmtInt(h.seatsEnrolled)} ENROLLED` : ""}</span>
          </span>
        </InstrumentPanel>
        <InstrumentPanel label="FORECASTING" code="M02" className={s.metric}>
          <DigitalCounter value={forecast.source === "none" ? null : forecast.forecastingAgents} size="md" />
          <span className={s.metricSub}>
            <span>{forecast.openForecasts} OPEN QUESTIONS</span>
            {forecast.demo ? <DemoBadge label="DEMO" /> : null}
          </span>
        </InstrumentPanel>
        <InstrumentPanel label="ACTIVE JOBS" code="M03" className={s.metric}>
          <DigitalCounter value={sw ? jobStates.executing ?? 0 : null} size="md" />
          <span className={s.metricSub}>
            <span>WORKING NOW {fmtInt(working)}</span>
          </span>
        </InstrumentPanel>
        <InstrumentPanel label="ORACLES 24H" code="M04" className={s.metric}>
          <DigitalCounter value={h?.oraclesDoneLastDay ?? null} size="md" />
          <span className={s.metricSub}>
            <span>PENDING {derived.pendingOracles === null ? UNKNOWN : derived.pendingOracles}</span>
          </span>
        </InstrumentPanel>
        <InstrumentPanel label="24H JOBS" code="M05" className={s.metric}>
          <DigitalCounter value={h?.jobsDoneLastDay ?? null} size="md" />
          <span className={s.metricSub}>
            <span>ACCEPTED {fmtInt(h?.acceptedLastDay ?? null)}</span>
          </span>
        </InstrumentPanel>
        <InstrumentPanel label="TOTAL EVENTS" code="M06" className={s.metric}>
          <DigitalCounter value={sw?.counts.events ?? (sw ? sw.totals.attempts : null)} size="md" />
          <span className={s.metricSub}>
            <span>{sw?.counts.events !== null && sw?.counts.events !== undefined ? "NETWORK EVENTS" : "SEAT ATTEMPTS"}</span>
          </span>
        </InstrumentPanel>
      </div>

      {/* ---------------- WALL ---------------- */}
      <div className={s.wall}>
        <div className={s.col}>
          <InstrumentPanel label="AGENT ACTIVITY" code="A-11" footer={<span>WORKING / ONLINE</span>}>
            <AnalogGauge value={workShare} label="LOAD" readout={workShare === null ? undefined : fmtPct(workShare, 1)} minLabel="0" maxLabel="100%" redline={0.85} />
            <Screen style={{ height: 58, padding: 0 }}>
              <MiniOscilloscope level={workShare} height={56} label="agent activity trace" />
            </Screen>
          </InstrumentPanel>

          <InstrumentPanel label="NETWORK HEALTH" code="H-02">
            <div className={s.ledGrid}>
              <StatusLED state={boolLed(h?.reachable ?? null)} label="REACHABLE" />
              <StatusLED state={boolLed(h?.verifierUp ?? null)} label="VERIFIER" />
              <StatusLED state={boolLed(h?.publisherUp ?? null)} label="PUBLISHER" />
              <StatusLED state={boolLed(h?.deployerUp ?? null)} label="DEPLOYER" />
            </div>
            <div className={s.kv}>
              <span>PENDING VERIFICATION</span>
              <span>{fmtInt(h?.pendingVerification ?? null)}</span>
            </div>
            <div className={s.kv}>
              <span>PENDING DEPLOYMENT</span>
              <span>{fmtInt(h?.pendingDeployment ?? null)}</span>
            </div>
            <div className={s.kv}>
              <span>LAST SYNC</span>
              <span>{now === 0 ? "--" : live.swarm.lastSuccess ? fmtAgo(live.swarm.lastSuccess, now) : UNKNOWN}</span>
            </div>
          </InstrumentPanel>

          <InstrumentPanel label="JOB QUEUE" code="Q-07" tone="dark">
            {jobTotal === 0 ? (
              <span className={s.mini} style={{ color: "var(--muted)" }}>
                {sw ? "NO JOB STATES REPORTED" : "DATA UNAVAILABLE"}
              </span>
            ) : (
              Object.entries(jobStates)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <div className={s.stateRow} key={k}>
                    <span>{k}</span>
                    <Meter value={v / jobTotal} width={14} tone={k === "blocked" ? "muted" : "ph"} />
                    <span>{fmtCompact(v)}</span>
                  </div>
                ))
            )}
            <div className={s.kv} style={{ color: "var(--muted)" }}>
              <span>TASKS IN PROGRESS</span>
              <span style={{ color: "var(--text)" }}>{fmtInt(sw?.counts.tasksInProgress ?? null)}</span>
            </div>
          </InstrumentPanel>
        </div>

        <div className={s.center}>
          <div className={s.crtHousing}>
            <TerminalWindow
              title="FORECASTERS // NETWORK TERMINAL"
              status={<span>IMD {statusText}</span>}
              glitch
            >
              <div className={s.termHead}>
                <span>
                  <b>{fmtInt(online)}</b> AGENTS ONLINE
                </span>
                <span>
                  <b>{fmtInt(working)}</b> WORKING
                </span>
                <span className={s.dim}>
                  24H: <b>{fmtInt(h?.jobsDoneLastDay ?? null)}</b> JOBS
                </span>
                <span className={s.dim}>
                  <b>{fmtInt(h?.oraclesDoneLastDay ?? null)}</b> ORACLES 24H
                </span>
              </div>
              {swarmStatus === "OFFLINE" || swarmStatus === "DEGRADED" ? (
                <div className={s.termDegraded}>
                  &gt; IMD CONNECTION ○ DEGRADED
                  <br />
                  &gt; LAST SUCCESSFUL SYNC: {live.swarm.lastSuccess && now ? fmtAgo(live.swarm.lastSuccess, now) : "NONE"}
                </div>
              ) : null}
              <div className={s.termLog}>
                {live.events.length === 0 ? (
                  <div className={s.mini} style={{ color: "var(--ph-2)" }}>
                    &gt; {swarmStatus === "SYNCING" ? "ESTABLISHING LINK TO IMD..." : "NO EVENTS AVAILABLE"}
                  </div>
                ) : (
                  <TerminalLog events={live.events} max={22} />
                )}
              </div>
            </TerminalWindow>
          </div>
        </div>

        <div className={s.col}>
          <InstrumentPanel
            label="ORACLE STATUS"
            code="O-19"
            footer={
              <>
                <span>AVG ATTEST {derived.avgLatency === null ? UNKNOWN : `${Math.round(derived.avgLatency)}s`}</span>
                <Link href="/oracle">OPEN ›</Link>
              </>
            }
          >
            <Screen tone="white">
              <div className={s.clockSmall}>LATEST REQUEST {derived.latest?.status ? `// ${derived.latest.status.toUpperCase()}` : ""}</div>
              <div className={s.oracleQ}>{derived.latest?.question || (live.oracle.lastSuccess ? "NO REQUESTS" : "DATA UNAVAILABLE")}</div>
              {derived.latest ? (
                <div className={s.oracleA}>
                  {derived.latest.chainId !== null ? `CHAIN ${derived.latest.chainId}` : ""} {derived.latest.answerType ? `// ${derived.latest.answerType}` : ""}
                </div>
              ) : null}
            </Screen>
          </InstrumentPanel>

          <InstrumentPanel label="FORECAST DISTRIBUTION" code="F-04" tone="dark" footer={<span>NETWORK P(YES), OPEN QUESTIONS</span>}>
            {forecast.demo ? (
              <div>
                <DemoBadge />
              </div>
            ) : null}
            <Screen>
              {forecast.distribution.length === 0 ? (
                <div className={s.mini} style={{ color: "var(--muted)", padding: "22px 0", textAlign: "center" }}>
                  NO OPEN FORECASTS
                </div>
              ) : (
                <>
                  <div className={s.histo}>
                    {bucketize(forecast.distribution, 10).map((v, i, arr) => (
                      <i key={i} style={{ height: `${(v / Math.max(1, ...arr)) * 100}%` }} />
                    ))}
                  </div>
                  <div className={s.histoAxis}>
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </>
              )}
            </Screen>
          </InstrumentPanel>

          <InstrumentPanel label="SYSTEM CLOCKS" code="C-01">
            <Screen>
              <div className={s.clock}>{now ? fmtClockUTC(now) : "--:--:--"}</div>
              <div className={s.clockSmall}>UTC // LOCAL {now ? fmtClock(now, true) : "--:--:--"}</div>
            </Screen>
            <div className={s.knobs}>
              <Knob value={workShare ?? 0} label="LOAD" />
              <Knob value={derived.acceptRate ?? 0} label="ACCEPT" />
              <Knob value={Math.min(1, (derived.pendingOracles ?? 0) / 20)} label="QUEUE" />
            </div>
          </InstrumentPanel>
        </div>
      </div>

      {/* ---------------- LOWER INSTRUMENT ROW ---------------- */}
      <div className={s.row}>
        <InstrumentPanel label="JOBS / HOUR" code="J-24" tone="dark" footer={<span>LAST 100 JOBS, 24H</span>}>
          <Screen style={{ padding: "6px 6px 2px" }}>
            <SignalGraph data={derived.hist} mode="bars" height={54} label="jobs per hour" />
          </Screen>
        </InstrumentPanel>
        <InstrumentPanel label="SEAT ACTIVITY" code="S-05">
          {(["WORKING", "ACTIVE", "IDLE", "DORMANT"] as const).map((k) => (
            <div className={s.kv} key={k}>
              <span>{k}</span>
              <span>{sw ? fmtInt(derived.activity[k]) : UNKNOWN}</span>
            </div>
          ))}
        </InstrumentPanel>
        <InstrumentPanel label="VERIFIED RATE" code="V-09">
          <AnalogGauge value={derived.acceptRate} label="ACCEPTED / DECIDED" readout={fmtPct(derived.acceptRate)} minLabel="0" maxLabel="100%" />
        </InstrumentPanel>
        <InstrumentPanel label="INFERENCE" code="I-88">
          <DigitalCounter value={sw?.counts.inferenceTokens ?? null} size="sm" format={fmtCompact} label="TOKENS" />
          <div className={s.kv}>
            <span>SITES</span>
            <span>{fmtInt(sw?.counts.sites ?? null)}</span>
          </div>
          <div className={s.kv}>
            <span>LAUNCHES LIVE</span>
            <span>{fmtInt(sw?.counts.launchesLive ?? null)}</span>
          </div>
        </InstrumentPanel>
        <InstrumentPanel label="SEATS" code="S-33">
          <DigitalCounter value={sw ? derived.seatCount : null} size="sm" label="IN SWARM MAP" />
          <div className={s.kv}>
            <span>PENDING WORK</span>
            <span>{sw ? fmtCompact(sw.totals.pending) : UNKNOWN}</span>
          </div>
        </InstrumentPanel>
        <InstrumentPanel label="FEEDS" code="L-03" tone="dark">
          {(["swarm", "jobs", "oracle"] as const).map((f) => {
            const st = live.status(f, now);
            const led: LedState = st === "ONLINE" ? "on" : st === "SYNCING" ? "idle" : st === "STALE" ? "warn" : "err";
            return <StatusLED key={f} state={led} blink={st === "SYNCING"} label={`${f} ${st}`} />;
          })}
        </InstrumentPanel>
      </div>
    </div>
  );
}

function bucketize(values: number[], n: number): number[] {
  const out = new Array<number>(n).fill(0);
  for (const v of values) {
    const i = Math.min(n - 1, Math.max(0, Math.floor(v * n)));
    out[i] = (out[i] ?? 0) + 1;
  }
  return out;
}

function fmtClockUTC(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}
