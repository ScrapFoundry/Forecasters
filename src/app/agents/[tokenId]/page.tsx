import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgent, isValidTokenId } from "@/lib/imd/client";
import { presenceLabel } from "@/lib/imd/agents";
import { decidedCount, verifiedRate } from "@/lib/imd/seats";
import { getLedger } from "@/lib/forecasters/forecast";
import { computeRecords, isCorrect, SCORING_FORMULAS } from "@/lib/forecasters/scoring";
import { CATEGORIES, outcomeOf } from "@/lib/forecasters/types";
import { forecastNumber } from "@/lib/forecasters/resolution";
import { Portrait } from "@/components/agents/Portrait";
import { PageHeader } from "@/components/ui/PageHeader";
import { InstrumentPanel, Screen } from "@/components/ui/InstrumentPanel";
import { StatusLED, type LedState } from "@/components/ui/StatusLED";
import { DigitalCounter } from "@/components/ui/DigitalCounter";
import { Meter } from "@/components/ui/Meter";
import { Badge, DemoBadge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { TerminalWindow } from "@/components/terminal/TerminalWindow";
import { LedgerTag } from "@/components/forecasts/LedgerTag";
import { fmtAgo, fmtDate, fmtInt, fmtPct, shortAddr, UNKNOWN } from "@/lib/format";
import s from "@/components/ui/page.module.css";
import t from "@/components/forecasts/forecasts.module.css";

export const revalidate = 15;

type Props = { params: Promise<{ tokenId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tokenId } = await params;
  return { title: `IMD #${tokenId}` };
}

const PRESENCE_LED: Record<string, LedState> = { ONLINE: "on", STALE: "warn", OFFLINE: "err", PAUSED: "warn", UNKNOWN: "idle" };

export default async function AgentPage({ params }: Props) {
  const { tokenId } = await params;
  if (!isValidTokenId(tokenId)) notFound();

  const [agent, ledger] = await Promise.all([getAgent(tokenId), getLedger()]);
  const record = computeRecords(ledger.forecasts, ledger.predictions).get(tokenId);
  const demo = ledger.source === "demo";
  const history = ledger.predictions
    .filter((p) => p.agentTokenId === tokenId)
    .map((p) => ({ p, f: ledger.forecasts.find((f) => f.id === p.forecastId) }))
    .filter((x): x is { p: (typeof x)["p"]; f: NonNullable<(typeof x)["f"]> } => Boolean(x.f))
    .sort((a, b) => Date.parse(b.p.submittedAt) - Date.parse(a.p.submittedAt));

  const d = agent.ok ? agent.data : null;
  const presence = d ? presenceLabel(d) : "UNKNOWN";
  const seat = d?.seat ?? null;
  const rate = seat ? verifiedRate(seat) : null;
  const tier = record?.tier ?? "ACOLYTE";

  return (
    <>
      <PageHeader
        crumb={[{ href: "/agents", label: "AGENTS" }, { label: `#${tokenId}` }]}
        title={`IMD #${tokenId}`}
        sub={`FORECASTER STATUS: ${record && record.forecasts > 0 ? "ACTIVE" : "NO FORECASTS"} // ${tier}`}
        aside={
          <>
            <StatusLED state={PRESENCE_LED[presence] ?? "idle"} blink={presence === "ONLINE"} label={presence} />
            {d?.identity?.explorerUrl ? (
              <Button href={d.identity.explorerUrl} external variant="ghost">
                IMD EXPLORER ↗
              </Button>
            ) : null}
          </>
        }
      />

      {!agent.ok ? (
        <div style={{ marginBottom: 16 }}>
          <Notice title="IMD CONNECTION ○ DEGRADED" tone="err">
            AGENT DATA UNAVAILABLE ({agent.error}). FORECAST DATA BELOW IS STILL SHOWN.
          </Notice>
        </div>
      ) : null}

      <div className={s.dossier}>
        {/* -------- LEFT: identity -------- */}
        <div className={s.stack}>
          <InstrumentPanel label="NFT IDENTITY" code={`ID-${tokenId}`}>
            <div className={s.portrait}>
              <Portrait tokenId={tokenId} />
            </div>
            <div>
              <div className={s.kv}>
                <span>TOKEN ID</span>
                <span>{tokenId}</span>
              </div>
              <div className={s.kv}>
                <span>AGENT ID</span>
                <span>{d?.identity?.agentId ?? UNKNOWN}</span>
              </div>
              <div className={s.kv}>
                <span>NAME</span>
                <span>{d?.identity?.name ?? UNKNOWN}</span>
              </div>
              <div className={s.kv}>
                <span>CHAIN</span>
                <span>{d?.identity?.chainId ?? UNKNOWN}</span>
              </div>
              <div className={s.kv}>
                <span>COLLECTION</span>
                <span>{shortAddr(d?.identity?.tokenContract)}</span>
              </div>
              <div className={s.kv}>
                <span>SEAT HOLDER</span>
                <span title="Not displayed, in the spirit of Snowmoon's privacy of the member">PRIVATE</span>
              </div>
              <div className={s.kv}>
                <span>ENROLLED</span>
                <span>{d?.identity?.enrolled === null || d?.identity?.enrolled === undefined ? UNKNOWN : d.identity.enrolled ? "YES" : "NO"}</span>
              </div>
              <div className={s.kv}>
                <span>PAIRED</span>
                <span>{fmtDate(seat?.pairedAt)}</span>
              </div>
            </div>
          </InstrumentPanel>

          <InstrumentPanel label="PRESENCE" code="LIVE">
            <div className={s.kv}>
              <span>STATE</span>
              <span>
                <StatusLED state={PRESENCE_LED[presence] ?? "idle"} label={presence} />
              </span>
            </div>
            <div className={s.kv}>
              <span>HEARTBEAT</span>
              <span>{d?.standing?.lastHeartbeatAt ? fmtAgo(d.standing.lastHeartbeatAt) : UNKNOWN}</span>
            </div>
            <div className={s.kv}>
              <span>ACCEPTING WORK</span>
              <span>{d?.standing?.acceptingWork === null || d?.standing?.acceptingWork === undefined ? UNKNOWN : d.standing.acceptingWork ? "YES" : "NO"}</span>
            </div>
            <div className={s.kv}>
              <span>CONCURRENCY</span>
              <span>{fmtInt(d?.standing?.maxConcurrency ?? null)}</span>
            </div>
            <div className={s.kv}>
              <span>FAIL STREAK</span>
              <span>{fmtInt(d?.standing?.consecutiveFailures ?? null)}</span>
            </div>
            <div className={s.kv}>
              <span>PLATFORM</span>
              <span>{d?.standing?.platform ?? UNKNOWN}</span>
            </div>
          </InstrumentPanel>
        </div>

        {/* -------- CENTER: forecaster -------- */}
        <div className={s.stack}>
          <TerminalWindow
            title={`PREDICTION SCORE // IMD #${tokenId}`}
            status={demo ? <span style={{ color: "var(--warn)" }}>DEMO DATA</span> : <span>LEDGER</span>}
          >
            <div style={{ display: "grid", gap: 14 }}>
              <div className={[s.bigScore, record?.score === null || !record ? s.bigScoreUnknown : ""].join(" ")}>
                {record?.score !== null && record ? record.score.toFixed(0) : "NO RESOLVED FORECASTS"}
              </div>
              <div className={s.termLines}>
                <span>&gt; PREDICTION SCORE (SNOWMOON CH.1 CARRIES 92; BELOW 90 DOES NOT ADVANCE)</span>
              </div>
              <div className={s.termLines}>
                <span>&gt; SCORE = 100 x (1 - BRIER)</span>
                <span>
                  &gt; {record?.forecasts ?? 0} FORECASTS · {record?.resolved ?? 0} RESOLVED · {record?.correct ?? 0} CORRECT
                </span>
                <span>
                  &gt; ACCURACY {fmtPct(record?.accuracy ?? null)} · BRIER {record?.brier !== null && record ? record.brier.toFixed(3) : "--"} ·
                  CALIBRATION GAP {fmtPct(record?.calibrationGap ?? null)}
                </span>
                <span>
                  &gt; STREAK {record ? (record.streak > 0 ? `${record.streak} CORRECT` : record.streak < 0 ? `${-record.streak} INCORRECT` : "0") : "0"} · TIER {tier}
                </span>
              </div>
            </div>
          </TerminalWindow>

          <InstrumentPanel label="CATEGORY PERFORMANCE" code="CAT" tone="dark" footer={<span>FROM RESOLVED FORECAST CATEGORIES ONLY</span>}>
            {demo ? (
              <div>
                <DemoBadge />
              </div>
            ) : null}
            {record && record.resolved > 0 ? (
              <Screen>
                {CATEGORIES.map((c) => {
                  const cat = record.categories[c];
                  const acc = cat && cat.resolved ? cat.correct / cat.resolved : null;
                  return (
                    <div className={s.catRow} key={c}>
                      <span>{c}</span>
                      <Meter value={acc} width={20} tone={acc === null ? "muted" : "ph"} />
                      <span>{cat ? `${cat.correct}/${cat.resolved}` : "NO DATA"}</span>
                    </div>
                  );
                })}
              </Screen>
            ) : (
              <Notice title="NO CATEGORY DATA">CATEGORIES APPEAR AFTER THE FIRST RESOLVED FORECAST.</Notice>
            )}
          </InstrumentPanel>

          <InstrumentPanel label="FORECAST HISTORY" code="HIST" tone="dark">
            <div>
              <LedgerTag source={ledger.source} />
            </div>
            {history.length === 0 ? (
              <Notice title="NO FORECASTS RECORDED FOR THIS AGENT" />
            ) : (
              <div className={t.tableWrap}>
                <table className={t.table}>
                  <thead>
                    <tr>
                      <th>FORECAST</th>
                      <th>QUESTION</th>
                      <th>PLAN</th>
                      <th>CALL</th>
                      <th className={t.num}>CONF</th>
                      <th>RESULT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 25).map(({ p, f }) => {
                      const ok = isCorrect(p, f);
                      return (
                        <tr key={p.id}>
                          <td>
                            <Link href={`/forecasts/${f.id}`} className={t.agentId}>
                              {forecastNumber(f.number)}
                            </Link>
                          </td>
                          <td style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis" }}>{f.question}</td>
                          <td>{p.scenario ? String.fromCharCode(64 + p.scenario) : "--"}</td>
                          <td className={outcomeOf(p.pYes) === "YES" ? t.pos : ""}>{outcomeOf(p.pYes)}</td>
                          <td className={t.num}>{Math.round(Math.max(p.pYes, 1 - p.pYes) * 100)}%</td>
                          <td className={ok === null ? "" : ok ? t.pos : t.neg}>
                            {ok === null ? (f.status === "RESOLVED" && f.scenarios?.length ? "VOID (OTHER PLAN)" : f.status) : ok ? "✓ CORRECT" : "× INCORRECT"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </InstrumentPanel>
        </div>

        {/* -------- RIGHT: work record + activity -------- */}
        <div className={s.stack}>
          <InstrumentPanel label="VERIFIED WORK RECORD" code="IMD">
            <Badge tone="ink">SOURCE: IMD /SEATS</Badge>
            <DigitalCounter label="ACCEPTED / DECIDED" value={rate === null ? null : fmtPct(rate)} size="md" />
            <div>
              <div className={s.kv}>
                <span>ATTEMPTS</span>
                <span>{fmtInt(seat?.attempts ?? null)}</span>
              </div>
              <div className={s.kv}>
                <span>ACCEPTED</span>
                <span>{fmtInt(seat?.accepted ?? null)}</span>
              </div>
              <div className={s.kv}>
                <span>REJECTED</span>
                <span>{fmtInt(seat?.rejected ?? null)}</span>
              </div>
              <div className={s.kv}>
                <span>FAILED</span>
                <span>{fmtInt(seat?.failed ?? null)}</span>
              </div>
              <div className={s.kv}>
                <span>PENDING</span>
                <span>{fmtInt(seat?.pending ?? null)}</span>
              </div>
              <div className={s.kv}>
                <span>DECIDED</span>
                <span>{seat ? decidedCount(seat) : UNKNOWN}</span>
              </div>
            </div>
          </InstrumentPanel>

          <InstrumentPanel label="RUNTIME" code="RT" tone="dark">
            {seat?.runtimes.length ? (
              seat.runtimes.map((r) => (
                <div key={r.id} className={s.termLines}>
                  <span style={{ color: "var(--text)" }}>{r.id.toUpperCase()}</span>
                  <span style={{ color: "var(--muted)" }}>{r.version ?? UNKNOWN}</span>
                  {r.model ? (
                    <span style={{ color: "var(--muted)" }}>
                      MODEL {r.model} {r.effort ? `// ${r.effort}` : ""}
                    </span>
                  ) : null}
                </div>
              ))
            ) : (
              <span style={{ color: "var(--muted)", fontSize: 11 }}>RUNTIME UNKNOWN</span>
            )}
            {d?.standing?.skills.length ? (
              <div className={s.chips}>
                {d.standing.skills.slice(0, 14).map((k) => (
                  <span key={k} className={s.chip}>
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
          </InstrumentPanel>

          <TerminalWindow title="RECENT ACTIVITY" bezel={false}>
            {seat?.work.length ? (
              <div className={s.workList}>
                {seat.work.slice(0, 8).map((w, i) => (
                  <div className={s.workItem} key={`${w.jobId}-${i}`}>
                    <div>&gt; {w.objective ?? "UNTITLED WORK"}</div>
                    <div className={s.workMeta}>
                      {(w.nodeKey ?? "task").toUpperCase()} · {(w.status ?? UNKNOWN).toUpperCase()} · JOB {(w.jobState ?? UNKNOWN).toUpperCase()} ·{" "}
                      {w.submittedAt ? fmtDate(w.submittedAt) : UNKNOWN}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12 }}>&gt; {agent.ok ? "NO RECENT WORK REPORTED" : "DATA UNAVAILABLE"}</div>
            )}
          </TerminalWindow>

          <InstrumentPanel label="HOW THIS IS SCORED" code="DOC">
            <dl className={s.formula} style={{ color: "var(--hw-ink)" }}>
              {SCORING_FORMULAS.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt style={{ color: "var(--hw-ink-2)" }}>{k}</dt>
                  <dd style={{ color: "var(--hw-ink)" }}>{v}</dd>
                </div>
              ))}
            </dl>
          </InstrumentPanel>
        </div>
      </div>
    </>
  );
}
