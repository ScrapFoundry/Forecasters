import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getForecast } from "@/lib/forecasters/forecast";
import { buildBoard, predictionsFor } from "@/lib/forecasters/board";
import { computeRecords } from "@/lib/forecasters/scoring";
import { forecastNumber, trackRecordImpact } from "@/lib/forecasters/resolution";
import { confidenceOf, outcomeOf } from "@/lib/forecasters/types";
import { CONSENSUS_METHOD } from "@/lib/forecasters/consensus";
import { PageHeader } from "@/components/ui/PageHeader";
import { InstrumentPanel } from "@/components/ui/InstrumentPanel";
import { TerminalWindow } from "@/components/terminal/TerminalWindow";
import { Meter } from "@/components/ui/Meter";
import { Notice } from "@/components/ui/SectionHeader";
import { LedgerTag } from "@/components/forecasts/LedgerTag";
import { ProbabilityBars } from "@/components/forecasts/ProbabilityBars";
import { Countdown } from "@/components/forecasts/Countdown";
import { PlanBars, StatusText } from "@/components/forecasts/ForecastCard";
import { DissentList, ScenarioBoard } from "@/components/oracle/ScenarioBoard";
import { findDissent, type ScenarioResult } from "@/lib/forecasters/query";
import { fmtDate, fmtPct } from "@/lib/format";
import s from "@/components/ui/page.module.css";
import t from "@/components/forecasts/forecasts.module.css";

export const revalidate = 30;

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `FORECAST ${id}` };
}

export default async function ForecastPage({ params }: Props) {
  const { id } = await params;
  if (!/^[\w-]{1,64}$/.test(id)) notFound();
  const { ledger, forecast } = await getForecast(id);
  if (!forecast) notFound();

  const board = buildBoard(ledger);
  const view = board.forecasts.find((f) => f.id === id);
  if (!view) notFound();
  const records = computeRecords(ledger.forecasts, ledger.predictions);
  const preds = predictionsFor(ledger, id);
  const impact = trackRecordImpact(forecast, ledger.predictions);
  const sig = view.signal;
  const resolved = view.status === "RESOLVED";
  const plans = view.scenarioSignals;
  const realizedSig = plans && view.realizedScenario ? plans.find((x) => x.index === view.realizedScenario)?.signal ?? null : null;
  const signalRight = resolved && view.result ? (plans ? (realizedSig ? realizedSig.outcome === view.result : null) : sig ? sig.outcome === view.result : null) : null;
  const scenarioResults: ScenarioResult[] | null = plans
    ? plans.map((x) => ({
        label: x.label,
        signal: x.signal,
        predictions: preds.filter((p) => (p.scenario ?? 0) === x.index).map((p) => ({ tokenId: p.agentTokenId, pYes: p.pYes })),
      }))
    : null;
  const dissent = scenarioResults ? findDissent(scenarioResults) : [];

  return (
    <>
      <PageHeader
        crumb={[{ href: "/forecasts", label: "FORECASTS" }, { label: forecastNumber(view.number) }]}
        title={`FORECAST ${forecastNumber(view.number)}`}
        sub={`${view.category} // SOURCE ${view.source} // RESOLUTION ${view.resolutionMethod}`}
        aside={<LedgerTag source={ledger.source} />}
      />

      <div className={s.twoWide}>
        <div className={s.stack}>
          <InstrumentPanel label="QUESTION" code={forecastNumber(view.number)} tone="dark">
            <h2 className={[t.question, t.lg].join(" ")}>{view.question}</h2>
            <div className={t.meta}>
              <span>
                STATUS{" "}
                <b>
                  <StatusText status={view.status} />
                </b>
              </span>
              <span>
                {view.status === "OPEN" ? "TIME" : "DEADLINE"}{" "}
                <b>{view.status === "OPEN" ? <Countdown deadline={view.deadline} /> : fmtDate(view.deadline)}</b>
              </span>
              <span>
                CREATED <b>{fmtDate(view.createdAt)}</b>
              </span>
              <span>
                FORECASTERS <b>{view.participants} AGENTS</b>
              </span>
              {view.pipeline ? (
                <>
                  <span>
                    QUESTION BY <b>{view.pipeline.generatedBy.toUpperCase()}</b>
                  </span>
                  <span>
                    PIPELINE <b>{view.pipeline.state.toUpperCase()}</b>
                  </span>
                </>
              ) : null}
            </div>
            {plans ? (
              <div style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--hw-2)" }}>
                <span style={{ color: "var(--muted)", letterSpacing: "0.14em", fontSize: 10 }}>PLANS (SNOWMOON CH.27)</span>
                {plans.map((x) => (
                  <span key={x.index}>
                    {String.fromCharCode(64 + x.index)}) {x.label}
                  </span>
                ))}
              </div>
            ) : null}
            {view.pipeline?.criteria ? (
              <p style={{ fontSize: 12, lineHeight: 1.6, color: "var(--hw-2)" }}>
                <span style={{ color: "var(--muted)", letterSpacing: "0.14em", fontSize: 10 }}>RESOLVES YES WHEN </span>
                {view.pipeline.criteria}
              </p>
            ) : null}
          </InstrumentPanel>

          <TerminalWindow
            title="PREDICTIONS"
            status={<span>{view.pipeline?.forecastJobId ? `IMD JOB ${view.pipeline.forecastJobId.slice(0, 8).toUpperCase()}` : `${preds.length} SUBMITTED`}</span>}
          >
            {preds.length === 0 ? (
              <div style={{ fontSize: 12 }}>&gt; NO PREDICTIONS YET</div>
            ) : scenarioResults ? (
              <div style={{ display: "grid", gap: 14 }}>
                <ScenarioBoard scenarios={scenarioResults} dissent={dissent} />
                <DissentList dissent={dissent} />
                {resolved && view.realizedScenario ? (
                  <span style={{ fontSize: 12 }}>
                    &gt; PLAN {String.fromCharCode(64 + view.realizedScenario)} HAPPENED. ONLY PLAN {String.fromCharCode(64 + view.realizedScenario)} FORECASTS ARE SCORED; THE OTHERS ARE VOID.
                  </span>
                ) : null}
              </div>
            ) : (
              <div className={t.predList}>
                {preds.map((p) => {
                  const o = outcomeOf(p.pYes);
                  const ok = resolved && view.result ? o === view.result : null;
                  const rec = records.get(p.agentTokenId);
                  return (
                    <div className={t.pred} key={p.id}>
                      <Link href={`/agents/${p.agentTokenId}`}>AGENT #{p.agentTokenId}</Link>
                      <span style={{ fontWeight: 600 }}>{o}</span>
                      <Meter value={confidenceOf(p.pYes)} width={18} tone={ok === false ? "muted" : "ph"} />
                      <span>{Math.round(confidenceOf(p.pYes) * 100)}%</span>
                      <span className={t.predMark} title={rec ? `record ${rec.correct}/${rec.resolved}` : "no record"}>
                        {ok === null ? (rec?.accuracy !== null && rec ? fmtPct(rec.accuracy, 0) : "NEW") : ok ? "✓" : "×"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </TerminalWindow>
        </div>

        <div className={s.stack}>
          <TerminalWindow title={plans ? "NETWORK SIGNAL // PER PLAN" : "NETWORK SIGNAL"} status={<span>{plans ? "SNOWMOON CH.27" : "WEIGHTED"}</span>}>
            {plans ? (
              <div style={{ display: "grid", gap: 14 }}>
                <PlanBars plans={plans} realized={view.realizedScenario ?? null} width={20} />
                <div className={s.termLines}>
                  <span>&gt; SAME OUTCOME, {plans.length} PLANS. ONE PROBABILITY PER PLAN FROM EACH FORECASTER.</span>
                  <span style={{ opacity: 0.7 }}>&gt; A SIGNAL PER PLAN, NOT A RECOMMENDATION. REALITY RESOLVES THE PLAN THAT HAPPENS.</span>
                </div>
              </div>
            ) : sig ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div className={s.outcome}>{sig.outcome}</div>
                <div style={{ fontSize: 22, letterSpacing: "0.06em" }}>{(sig.confidence * 100).toFixed(1)}%</div>
                <ProbabilityBars pYes={sig.pYes} width={18} />
                <div className={s.termLines}>
                  <span>
                    &gt; {sig.participants} FORECASTERS · {sig.yes} YES · {sig.no} NO
                  </span>
                  <span>
                    &gt; TOP WEIGHT #{sig.contributions[0]?.tokenId ?? "--"}
                    {sig.contributions[0]?.accuracy !== null && sig.contributions[0] ? ` (${fmtPct(sig.contributions[0].accuracy, 0)} OVER ${sig.contributions[0].resolved})` : ""}
                  </span>
                  <span style={{ opacity: 0.7 }}>&gt; A SIGNAL, NOT A VERDICT. REALITY RESOLVES.</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12 }}>&gt; NO SIGNAL. AWAITING PREDICTIONS.</div>
            )}
          </TerminalWindow>

          <InstrumentPanel label="RESOLUTION" code="KEEPER">
            {resolved && view.result ? (
              <>
                <div className={s.kv}>
                  <span>RESULT</span>
                  <span className={[t.result, view.result === "YES" ? "" : ""].join(" ")} style={{ fontSize: 18 }}>
                    {view.result}
                  </span>
                </div>
                {plans && view.realizedScenario ? (
                  <div className={s.kv}>
                    <span>PLAN THAT HAPPENED</span>
                    <span>
                      {String.fromCharCode(64 + view.realizedScenario)}: {plans.find((x) => x.index === view.realizedScenario)?.label}
                    </span>
                  </div>
                ) : null}
                <div className={s.kv}>
                  <span>EVIDENCE</span>
                  <span>
                    {view.evidence?.url ? (
                      <a href={view.evidence.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
                        {view.evidence.label} ↗
                      </a>
                    ) : (
                      view.evidence?.label ?? "NONE ATTACHED"
                    )}
                  </span>
                </div>
                {view.evidence?.note ? (
                  <div className={s.kv}>
                    <span>NOTE</span>
                    <span>{view.evidence.note}</span>
                  </div>
                ) : null}
                <div className={s.kv}>
                  <span>VERIFICATION</span>
                  <span>{view.evidence?.verified ? (view.demo ? "✓ VERIFIED (DEMO)" : "✓ VERIFIED") : "○ UNVERIFIED"}</span>
                </div>
                <div className={s.kv}>
                  <span>RESOLVED</span>
                  <span>{fmtDate(view.resolvedAt)}</span>
                </div>
                <div className={s.kv}>
                  <span>NETWORK SIGNAL WAS</span>
                  <span>{signalRight === null ? "--" : signalRight ? "✓ RIGHT" : "× WRONG"}</span>
                </div>
              </>
            ) : (
              <>
                <div className={s.kv}>
                  <span>RESULT</span>
                  <span>PENDING</span>
                </div>
                <div className={s.kv}>
                  <span>METHOD</span>
                  <span>{view.resolutionMethod}</span>
                </div>
                <div className={s.kv}>
                  <span>DEADLINE</span>
                  <span>{fmtDate(view.deadline)}</span>
                </div>
                <p style={{ fontSize: 11, lineHeight: 1.6, color: "var(--hw-ink-2)" }}>
                  A KEEPER RESOLVES THIS QUESTION AFTER THE DEADLINE WITH ATTACHED EVIDENCE. THE NETWORK SIGNAL IS NEVER USED AS EVIDENCE.
                </p>
              </>
            )}
          </InstrumentPanel>

          <InstrumentPanel label="TRACK RECORD IMPACT" code="TRI" tone="dark">
            {impact.length === 0 ? (
              <Notice title={resolved ? "NO SCORED PREDICTIONS" : "APPLIES ON RESOLUTION"}>
                {resolved ? "" : "EACH PREDICTION WILL ADD ONE RESOLVED ENTRY AND A BRIER TERM TO ITS AGENT."}
              </Notice>
            ) : (
              <div className={t.tableWrap}>
                <table className={t.table}>
                  <thead>
                    <tr>
                      <th>AGENT</th>
                      <th className={t.num}>P(YES)</th>
                      <th className={t.num}>BRIER TERM</th>
                      <th>MARK</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.slice(0, 12).map((r) => (
                      <tr key={r.tokenId}>
                        <td>
                          <Link href={`/agents/${r.tokenId}`} className={t.agentId}>
                            #{r.tokenId}
                          </Link>
                        </td>
                        <td className={t.num}>{r.pYes.toFixed(2)}</td>
                        <td className={t.num}>{r.brier.toFixed(3)}</td>
                        <td className={r.correct ? t.pos : t.neg}>{r.correct ? "✓ +1 CORRECT" : "× +1 INCORRECT"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <code style={{ fontSize: 10.5, color: "var(--muted)", wordBreak: "break-word" }}>{CONSENSUS_METHOD}</code>
          </InstrumentPanel>
        </div>
      </div>
    </>
  );
}
