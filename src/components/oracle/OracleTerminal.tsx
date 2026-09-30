"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { OracleQueryResponse } from "@/lib/forecasters/query";
import { TerminalWindow } from "@/components/terminal/TerminalWindow";
import { Cursor } from "@/components/terminal/CRTScreen";
import { Button } from "@/components/ui/Button";
import { Meter } from "@/components/ui/Meter";
import { Badge } from "@/components/ui/Badge";
import { ProbabilityBars } from "@/components/forecasts/ProbabilityBars";
import { DissentList, ScenarioBoard } from "./ScenarioBoard";
import { fmtPct } from "@/lib/format";
import s from "@/components/ui/page.module.css";

type Phase = "idle" | "selecting" | "forecasting" | "done" | "error";

const SUGGESTIONS = [
  "Will ETH trade above $3,000 before the end of the month?",
  "Will the IMD swarm attest more than 60 oracle requests tomorrow?",
  "Will more than 500 IMD agents be online next week?",
  "Will BTC touch $85,000 before October 15?",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ASK THE FORECASTERS. Inspired by the idea of querying the top of a public
 * prediction leaderboard. Selection is real and transparent; the signal is
 * labeled SIMULATED until IMD exposes forecast dispatch to agents.
 */
export function OracleTerminal() {
  const [q, setQ] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState(0);
  const [progress, setProgress] = useState(0);
  const [res, setRes] = useState<OracleQueryResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const [scenMode, setScenMode] = useState(false);
  const [scen, setScen] = useState<string[]>(["", "", ""]);
  const scenList = scen.map((x) => x.trim()).filter((x) => x.length >= 3);
  const run = useRef(0);

  useEffect(() => () => void (run.current += 1), []);

  const submit = async () => {
    const question = q.trim();
    if (question.length < 8 || phase === "selecting" || phase === "forecasting") return;
    const id = ++run.current;
    setErr(null);
    setRes(null);
    setShown(0);
    setProgress(0);
    setShowEvidence(false);
    setPhase("selecting");
    try {
      const r = await fetch("/api/forecasters/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(scenMode ? { question, scenarios: scenList } : { question }),
      });
      const body = (await r.json()) as OracleQueryResponse & { error?: string };
      if (id !== run.current) return;
      if (!r.ok || body.error) throw new Error(body.error ?? `HTTP ${r.status}`);
      setRes(body);
      for (let i = 1; i <= body.selected.length; i++) {
        await sleep(260);
        if (id !== run.current) return;
        setShown(i);
      }
      await sleep(300);
      setPhase("forecasting");
      for (let p = 0; p <= 100; p += 7) {
        await sleep(45);
        if (id !== run.current) return;
        setProgress(Math.min(100, p));
      }
      setProgress(100);
      setPhase("done");
    } catch (e) {
      if (id !== run.current) return;
      setErr(e instanceof Error ? e.message : "QUERY FAILED");
      setPhase("error");
    }
  };

  const top = res?.selected[0];
  const busy = phase === "selecting" || phase === "forecasting";

  return (
    <div className={s.stack}>
      <TerminalWindow title="ASK THE FORECASTERS // CHAPTER 27 TERMINAL" status={<span>{busy ? "◌ WORKING" : "● READY"}</span>}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className={s.prompt}>
            <span>&gt;</span>
            <textarea
              className={s.oracleInput}
              value={q}
              maxLength={280}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="What is likely to happen to ETH before the end of the month?"
              aria-label="question for the network"
            />
          </label>
          <div id="scenarios" style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, letterSpacing: "0.14em", cursor: "pointer" }}>
              <input type="checkbox" checked={scenMode} onChange={(e) => setScenMode(e.target.checked)} />
              CHAPTER 27 MODE: SAME OUTCOME, SEVERAL PLANS
            </label>
            {scenMode
              ? scen.map((v, i) => (
                  <label key={i} className={s.prompt} style={{ fontSize: 13 }}>
                    <span>{String.fromCharCode(65 + i)}</span>
                    <input
                      value={v}
                      maxLength={140}
                      onChange={(e) => setScen((old) => old.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder={["IF nothing changes (status quo)", "IF plan B is adopted", "IF plan C is adopted"][i]}
                      style={{ background: "transparent", border: 0, borderBottom: "1px dashed rgba(57,255,106,0.25)", color: "var(--ph)", outline: 0, padding: "4px 0" }}
                      aria-label={`scenario ${String.fromCharCode(65 + i)}`}
                    />
                  </label>
                ))
              : null}
          </div>
          <div className={s.oracleBar}>
            <span style={{ opacity: 0.7 }}>{q.trim().length}/280 · ENTER TO SUBMIT</span>
            <Button type="submit" variant="term" disabled={busy || q.trim().length < 8 || (scenMode && scenList.length < 2)}>
              [ QUERY NETWORK ]
            </Button>
          </div>
        </form>
      </TerminalWindow>

      {phase === "idle" ? (
        <div className={s.suggest}>
          {SUGGESTIONS.map((x) => (
            <button key={x} type="button" onClick={() => setQ(x)}>
              &gt; {x}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setQ("Will the IMD swarm complete more than 60 jobs in the next 24 hours?");
              setScenMode(true);
              setScen(["nothing changes", "job price drops to 0.25 IMD", "100 more seats enroll this week"]);
            }}
          >
            &gt; CHAPTER 27 EXAMPLE: one outcome, three plans
          </button>
        </div>
      ) : null}

      {phase !== "idle" ? (
        <TerminalWindow title="NETWORK RESPONSE" status={res ? <span>{res.basis}</span> : undefined} glitch>
          <div className={s.termLines}>
            {phase === "error" ? (
              <span style={{ color: "var(--err)" }}>&gt; QUERY FAILED: {err}</span>
            ) : (
              <>
                <span className={s.phaseLine}>&gt; SELECTING FORECASTERS...</span>
                {res && res.selected.length === 0 ? (
                  <span style={{ color: "var(--warn)" }}>&gt; NO ELIGIBLE FORECASTERS. IMD SWARM {res.imd.swarm ? "ONLINE" : "UNAVAILABLE"}.</span>
                ) : null}
                {res?.selected.slice(0, shown).map((a) => (
                  <span key={a.tokenId} className={s.phaseLine}>
                    &gt;{" "}
                    <Link href={`/agents/${a.tokenId}`} style={{ textDecoration: "underline" }}>
                      #{a.tokenId}
                    </Link>{" "}
                    <span style={{ opacity: 0.7 }}>
                      {a.tier} · {fmtPct(a.metric)} OVER {a.resolved}
                    </span>
                  </span>
                ))}
                {res && shown >= res.selected.length && res.selected.length > 0 ? (
                  <span className={s.phaseLine}>&gt; {res.selected.length} AGENTS SELECTED</span>
                ) : null}
                {phase === "forecasting" || phase === "done" ? (
                  <>
                    <span className={s.phaseLine}>&gt; FORECASTING...</span>
                    <span>
                      <Meter value={progress / 100} width={20} /> {progress}%
                    </span>
                  </>
                ) : null}
                {busy ? <Cursor /> : null}
              </>
            )}
          </div>

          {phase === "done" && res ? (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed rgba(57,255,106,0.25)", display: "grid", gap: 12 }}>
              {res.scenarios.length ? (
                <>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ letterSpacing: "0.18em", fontSize: 12 }}>CHAPTER 27 QUERY // {res.scenarios.length} PLANS</span>
                    {res.simulated ? <Badge tone="sim">SIMULATED SIGNAL</Badge> : null}
                  </div>
                  {res.simulated ? (
                    <ScenarioBoard scenarios={res.scenarios} dissent={res.dissent} />
                  ) : (
                    <div className={s.termLines}>
                      <span>&gt; PLANS RECEIVED: {res.scenarios.map((x) => x.label).join(" / ")}</span>
                      <span style={{ color: "var(--warn)" }}>&gt; AD HOC QUERIES ARE NOT DISPATCHED TO AGENTS. SELECTION ABOVE IS REAL.</span>
                    </div>
                  )}
                  {res.simulated ? <DissentList dissent={res.dissent} /> : null}
                </>
              ) : res.signal ? (
                <>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ letterSpacing: "0.18em", fontSize: 12 }}>NETWORK FORECAST</span>
                    {res.simulated ? (
                      <Badge tone="sim" title="IMD does not yet expose a forecast dispatch endpoint. These values come from the FORECASTERS simulator.">
                        SIMULATED SIGNAL
                      </Badge>
                    ) : null}
                  </div>
                  <div className={s.outcome}>{res.signal.outcome}</div>
                  <div style={{ fontSize: 24 }}>{(res.signal.confidence * 100).toFixed(1)}%</div>
                  <ProbabilityBars pYes={res.signal.pYes} width={20} />
                  <div className={s.termLines}>
                    <span>
                      &gt; {res.signal.participants} FORECASTERS · {res.signal.yes} YES · {res.signal.no} NO
                    </span>
                    {top ? (
                      <span>
                        &gt; TOP SIGNAL IMD #{top.tokenId} · TRACK RECORD {fmtPct(top.metric, 0)}
                      </span>
                    ) : null}
                  </div>
                  <DissentList dissent={res.dissent} />
                  {res.simulated ? (
                    <p style={{ fontSize: 11, color: "var(--warn)", lineHeight: 1.6, textShadow: "none" }}>
                      AD HOC QUERIES ARE NOT SENT TO AGENTS (EACH DISPATCH COSTS IMD AND THIS SCREEN IS PUBLIC). THESE PROBABILITIES COME FROM THE
                      FORECASTERS SIMULATOR TO EXERCISE THE CONSENSUS ENGINE. REAL AGENT FORECASTS LIVE ON THE FORECASTS LEDGER.
                    </p>
                  ) : null}
                </>
              ) : (
                <div className={s.termLines}>
                  <span>&gt; NETWORK FORECAST: AWAITING AGENT RESPONSES</span>
                  <span style={{ color: "var(--warn)" }}>&gt; AD HOC QUERIES ARE NOT DISPATCHED TO AGENTS. REAL FORECASTS COME FROM THE PAID PIPELINE.</span>
                  <span style={{ opacity: 0.7 }}>&gt; SELECTION ABOVE IS REAL. NO SIGNAL IS FABRICATED.</span>
                </div>
              )}

              <div>
                <Button variant="term" type="button" onClick={() => setShowEvidence((v) => !v)}>
                  [ {showEvidence ? "HIDE" : "VIEW"} EVIDENCE ]
                </Button>
              </div>
              {showEvidence ? (
                <div className={s.termLines}>
                  <span>&gt; RELATED ATTESTED IMD ORACLE ANSWERS ({res.related.length})</span>
                  {res.related.length === 0 ? (
                    <span style={{ opacity: 0.7 }}>&gt; {res.imd.oracle ? "NO RELATED ATTESTED QUESTIONS IN RECENT IMD HISTORY" : "IMD ORACLE FEED UNAVAILABLE"}</span>
                  ) : (
                    res.related.map((r) => (
                      <span key={r.id}>
                        &gt;{" "}
                        <Link href={`/oracle?request=${r.id}`} style={{ textDecoration: "underline" }}>
                          {r.id.slice(0, 8).toUpperCase()}
                        </Link>{" "}
                        {r.question}
                      </span>
                    ))
                  )}
                  <span style={{ opacity: 0.7 }}>&gt; SELECTION BASIS: {res.basis}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </TerminalWindow>
      ) : null}
    </div>
  );
}
