"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useSignMessage } from "wagmi";
import { InstrumentPanel, Screen } from "@/components/ui/InstrumentPanel";
import { TerminalWindow } from "@/components/terminal/TerminalWindow";
import { StatusLED } from "@/components/ui/StatusLED";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { Meter } from "@/components/ui/Meter";
import { Notice } from "@/components/ui/SectionHeader";
import { ConnectButton } from "@/components/shell/ConnectButton";
import { CATEGORIES } from "@/lib/forecasters/types";
import { fmtDate, shortAddr } from "@/lib/format";
import p from "@/components/ui/page.module.css";
import t from "@/components/forecasts/forecasts.module.css";

interface Config {
  supabase: boolean;
  payer: boolean;
  paymentsEnabled: boolean;
  generator: boolean;
  model: string;
  generateMode: string;
  perDay: number;
  forecastPanel: number;
  oraclePanel: number;
  oracleQuorum: number;
  dailyBudgetImd: number;
  cron: boolean;
}
interface Wallet {
  address?: string;
  eth?: string | null;
  imd?: string | null;
  permit2Allowance?: string | null;
  needsApproval?: boolean | null;
  error?: string;
}
interface FRow {
  id: string;
  number: number;
  question: string;
  category: string;
  deadline: string;
  status: string;
  pipeline_state: string;
  generated_by: string;
  forecast_job_id: string | null;
  oracle_request_id: string | null;
  attempts: number;
  last_error: string | null;
}
interface ORow {
  id: string;
  action: string;
  purpose: string;
  status: string;
  order_id: string | null;
  job_id: string | null;
  oracle_request_id: string | null;
  error: string | null;
  created_at: string;
}
interface State {
  config: Config;
  wallet: Wallet | null;
  budget: { spentImd: number; limitImd: number; remainingActions: number } | null;
  paused: boolean | null;
  forecasts: FRow[];
  orders: ORow[];
  worker: { at: string; note: string } | null;
  token: { address: string | null; symbol: string | null; live: boolean };
  launched: { at: string; address: string } | null;
}
interface Q {
  question: string;
  category: string;
  deadlineHours: number;
  resolutionCriteria: string;
  oracleQuestion: string;
  source: string;
  scenarios?: string[];
  conditionQuestion?: string;
}

const led = (b: boolean | null | undefined) => (b === null || b === undefined ? "idle" : b ? "on" : "err");

/**
 * Operator console. Everything that spends IMD goes through server routes
 * guarded by the signed session; this page never sees a private key.
 */
export function OperatorConsole() {
  const { address, isConnected } = useConnection();
  const sign = useSignMessage();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [state, setState] = useState<State | null>(null);
  const [out, setOut] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Q[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<Q>({ question: "", category: "CRYPTO", deadlineHours: 72, resolutionCriteria: "", oracleQuestion: "", source: "MARKET DATA", scenarios: ["", "", ""], conditionQuestion: "" });

  const print = (lines: string[] | string) => setOut((o) => [...(Array.isArray(lines) ? lines : [lines]).map((l) => `${new Date().toISOString().slice(11, 19)} ${l}`), ...o].slice(0, 200));

  const load = useCallback(async () => {
    const r = await fetch("/api/operator/state", { cache: "no-store" });
    if (r.status === 401) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    setState((await r.json()) as State);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const doLogin = async () => {
    try {
      setBusy("login");
      const n = await fetch("/api/operator/nonce", { cache: "no-store" });
      const nb = (await n.json()) as { message?: string; error?: string };
      if (!nb.message) throw new Error(nb.error ?? "nonce failed");
      const signature = await sign.mutateAsync({ message: nb.message });
      const l = await fetch("/api/operator/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ signature }) });
      if (!l.ok) throw new Error("signature rejected: wallet is not OPERATOR_ADDRESS");
      await load();
    } catch (e) {
      print(`LOGIN FAILED: ${e instanceof Error ? e.message.split("\n")[0] : "unknown"}`);
    } finally {
      setBusy(null);
    }
  };

  const act = async (type: string, extra: Record<string, unknown> = {}) => {
    setBusy(type);
    try {
      const r = await fetch("/api/operator/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, ...extra }) });
      const b = (await r.json()) as Record<string, unknown>;
      if (!r.ok) print(`${type.toUpperCase()} ERROR: ${String(b.error)}`);
      if (Array.isArray(b.log)) print((b.log as string[]).map((l) => `${type}: ${l}`));
      if (b.report) print(((b.report as { log: string[] }).log ?? []).map((l) => `tick: ${l}`));
      if (b.probe) print(JSON.stringify(b.probe, null, 2).split("\n").reverse());
      if (b.txHash) print(`permit2 approval tx ${String(b.txHash)}`);
      if (b.preview) {
        const pv = b.preview as { accepted: Q[]; rejected: { q: string; reason: string }[] };
        setPreview(pv.accepted);
        setPicked(new Set(pv.accepted.map((_, i) => i)));
        pv.rejected.forEach((x) => print(`generator rejected (${x.reason}): ${x.q}`));
      }
      await load();
    } catch (e) {
      print(`${type.toUpperCase()} ERROR: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setBusy(null);
    }
  };

  if (authed === null) return <Notice title="CHECKING OPERATOR SESSION" />;

  if (!authed) {
    return (
      <div className={p.two}>
        <InstrumentPanel label="OPERATOR LOGIN" code="AUTH">
          <p style={{ fontSize: 12, lineHeight: 1.7 }}>
            Connect the wallet set as OPERATOR_ADDRESS and sign a one time message. Signing is free and approves nothing.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <ConnectButton />
            <Button onClick={() => void doLogin()} disabled={!isConnected || busy === "login"}>
              {busy === "login" ? "SIGNING..." : "SIGN IN"}
            </Button>
          </div>
          {isConnected ? <span style={{ fontSize: 11 }}>CONNECTED {shortAddr(address)}</span> : null}
        </InstrumentPanel>
        <TerminalWindow title="OPERATOR LOG">
          <div className={p.termLines}>{out.length ? out.map((l, i) => <span key={i}>&gt; {l}</span>) : <span>&gt; AWAITING OPERATOR</span>}</div>
        </TerminalWindow>
      </div>
    );
  }

  if (!state) return <Notice title="LOADING CONSOLE" />;
  const c = state.config;
  const w = state.wallet;
  const b = state.budget;

  return (
    <div className={p.stack}>
      {/* ---------- status row ---------- */}
      <div className={p.three}>
        <InstrumentPanel label="SUBSYSTEMS" code="SYS">
          <div style={{ display: "grid", gap: 8 }}>
            <StatusLED
              state={state.token.live ? "on" : "warn"}
              label={
                state.token.live
                  ? `TOKEN CA LIVE ${shortAddr(state.token.address)}${state.launched ? ` · LAUNCHED ${fmtDate(state.launched.at)}` : " · LAUNCHING"}`
                  : "PRE-LAUNCH: SET TOKEN_ADDRESS IN .env TO START"
              }
            />
            <StatusLED state={led(c.supabase)} label="SUPABASE LEDGER" />
            <StatusLED state={led(c.generator)} label={`GENERATOR ${c.model.toUpperCase()} (${c.generateMode.toUpperCase()})`} />
            <StatusLED state={led(c.payer)} label="PAYER WALLET" />
            <StatusLED state={c.paymentsEnabled ? "on" : "warn"} label={c.paymentsEnabled ? "PAYMENTS ENABLED" : "PAYMENTS DISABLED"} />
            <StatusLED
              state={state.worker && Date.now() - Date.parse(state.worker.at) < 90 * 60_000 ? "on" : "warn"}
              label={state.worker ? `VPS WORKER ${fmtDate(state.worker.at)} · ${state.worker.note.toUpperCase()}` : "VPS WORKER NOT SEEN"}
            />
          </div>
          <div className={p.kv}>
            <span>PER DAY</span>
            <span>{c.perDay} QUESTIONS</span>
          </div>
          <div className={p.kv}>
            <span>PANELS</span>
            <span>
              {c.forecastPanel} FORECASTERS · ORACLE {c.oraclePanel}/{c.oracleQuorum}
            </span>
          </div>
        </InstrumentPanel>

        <InstrumentPanel label="PAYER WALLET (HOT, DEDICATED)" code="W-01">
          {!w ? (
            <span style={{ fontSize: 11, lineHeight: 1.6 }}>
              KEY LIVES ON THE VPS WORKER (RECOMMENDED). CHECK IT THERE WITH: npm run imd -- wallet
            </span>
          ) : w.error ? (
            <span style={{ fontSize: 11, color: "var(--err)" }}>{w.error}</span>
          ) : (
            <>
              <div className={p.kv}>
                <span>ADDRESS</span>
                <span>{shortAddr(w.address)}</span>
              </div>
              <div className={p.kv}>
                <span>IMD</span>
                <span>{w.imd ? Number(w.imd).toFixed(2) : "UNKNOWN"}</span>
              </div>
              <div className={p.kv}>
                <span>ETH (GAS)</span>
                <span>{w.eth ? Number(w.eth).toFixed(5) : "UNKNOWN"}</span>
              </div>
              <div className={p.kv}>
                <span>PERMIT2 ALLOWANCE</span>
                <span>{w.permit2Allowance === null || w.permit2Allowance === undefined ? "UNKNOWN" : Number(w.permit2Allowance) > 1e12 ? "MAX" : Number(w.permit2Allowance).toFixed(2)}</span>
              </div>
              {w.needsApproval ? (
                <Button onClick={() => void act("approve-permit2")} disabled={busy !== null || !c.paymentsEnabled}>
                  APPROVE IMD FOR PERMIT2 (ONE TX)
                </Button>
              ) : null}
            </>
          )}
        </InstrumentPanel>

        <InstrumentPanel label="DAILY BUDGET" code="B-01">
          {b ? (
            <>
              <Screen>
                <div style={{ fontSize: 22 }}>
                  {b.spentImd.toFixed(1)} / {b.limitImd} IMD
                </div>
                <Meter value={b.limitImd ? b.spentImd / b.limitImd : 0} width={22} />
                <div style={{ fontSize: 11, opacity: 0.8 }}>{b.remainingActions} ACTIONS LEFT TODAY (0.5 IMD EACH)</div>
              </Screen>
            </>
          ) : (
            <span style={{ fontSize: 11 }}>UNKNOWN</span>
          )}
          <Switch on={state.paused === true} onChange={(v) => void act("pause", { paused: v })} label={state.paused ? "PIPELINE PAUSED" : "PAUSE PIPELINE"} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button onClick={() => void act("tick")} disabled={busy !== null}>
              {c.payer ? "RUN TICK" : "WAKE WORKER"}
            </Button>
            {c.payer ? (
              <Button onClick={() => void act("probe")} disabled={busy !== null} title="Free: quotes and reads one challenge, never signs">
                PROBE IMD (FREE)
              </Button>
            ) : null}
          </div>
        </InstrumentPanel>
      </div>

      {/* ---------- generate + create ---------- */}
      <div className={p.two}>
        <TerminalWindow title="QUESTION GENERATOR" status={<span>{c.generator ? "READY" : "NO OPENAI KEY"}</span>}>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button variant="term" onClick={() => void act("generate", { count: 3 })} disabled={busy !== null || !c.generator}>
                [ GENERATE 3 ]
              </Button>
              {preview.length ? (
                <Button
                  variant="term"
                  onClick={() => {
                    void act("publish", { questions: preview.filter((_, i) => picked.has(i)) });
                    setPreview([]);
                  }}
                  disabled={busy !== null || picked.size === 0}
                >
                  [ PUBLISH {picked.size} ]
                </Button>
              ) : null}
            </div>
            {preview.map((q, i) => (
              <label key={i} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 8, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={picked.has(i)}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i);
                      else n.add(i);
                      return n;
                    })
                  }
                />
                <span>
                  {q.question}
                  <br />
                  <span style={{ opacity: 0.65 }}>
                    {q.category} · {q.deadlineHours}H · {q.source} · YES WHEN: {q.resolutionCriteria}
                  </span>
                  {q.scenarios?.length ? (
                    <span style={{ display: "block", color: "var(--warn)" }}>
                      CH.27 PLANS: {q.scenarios.map((x, i) => `${String.fromCharCode(65 + i)}) ${x}`).join(" · ")}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
            {!preview.length ? <span style={{ fontSize: 11, opacity: 0.7 }}>&gt; THE CRON GENERATES {c.perDay} PER DAY AUTOMATICALLY. USE THIS TO PREVIEW EXTRA ONES.</span> : null}
          </div>
        </TerminalWindow>

        <InstrumentPanel label="CREATE QUESTION" code="Q-NEW">
          <form
            style={{ display: "grid", gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              const plans = (form.scenarios ?? []).map((x) => x.trim()).filter(Boolean);
              void act("create", { question: { ...form, scenarios: plans, conditionQuestion: plans.length ? form.conditionQuestion : "" } });
            }}
          >
            <OpInput label="QUESTION (FUTURE, ENDS WITH ?)" value={form.question} onChange={(v) => setForm({ ...form, question: v })} />
            <OpInput label="RESOLVES YES WHEN" value={form.resolutionCriteria} onChange={(v) => setForm({ ...form, resolutionCriteria: v })} />
            <OpInput label="ORACLE QUESTION (PAST TENSE, UTC DATES)" value={form.oracleQuestion} onChange={(v) => setForm({ ...form, oracleQuestion: v })} />
            <div style={{ display: "grid", gap: 6, padding: "8px 0", borderTop: "1px dashed rgba(0,0,0,0.25)" }}>
              <span style={{ fontSize: 9.5, letterSpacing: "0.14em" }}>OPTIONAL: SNOWMOON CH.27 PLANS (2 OR 3, MUTUALLY EXCLUSIVE)</span>
              {(form.scenarios ?? ["", "", ""]).map((v, i) => (
                <OpInput
                  key={i}
                  label={`PLAN ${String.fromCharCode(65 + i)}`}
                  value={v}
                  onChange={(x) => setForm({ ...form, scenarios: (form.scenarios ?? ["", "", ""]).map((y, j) => (j === i ? x : y)) })}
                />
              ))}
              <OpInput label="WHICH-PLAN ORACLE QUESTION (PAST TENSE)" value={form.conditionQuestion ?? ""} onChange={(v) => setForm({ ...form, conditionQuestion: v })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <OpSelect label="CATEGORY" value={form.category} options={CATEGORIES} onChange={(v) => setForm({ ...form, category: v })} />
              <OpSelect label="SOURCE" value={form.source} options={["MARKET DATA", "IMD API", "ON CHAIN READ", "PUBLIC RECORD"]} onChange={(v) => setForm({ ...form, source: v })} />
              <OpInput label="HOURS (24 TO 336)" value={String(form.deadlineHours)} onChange={(v) => setForm({ ...form, deadlineHours: Number(v) || 0 })} />
            </div>
            <Button type="submit" disabled={busy !== null}>
              CREATE AND QUEUE
            </Button>
          </form>
        </InstrumentPanel>
      </div>

      {/* ---------- pipeline ---------- */}
      <InstrumentPanel label="PIPELINE" code="P-01" tone="dark">
        {state.forecasts.length === 0 ? (
          <Notice title="NO QUESTIONS YET" />
        ) : (
          <div className={t.tableWrap}>
            <table className={t.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>QUESTION</th>
                  <th>STATE</th>
                  <th>DEADLINE</th>
                  <th>BY</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {state.forecasts.map((f) => (
                  <tr key={f.id}>
                    <td>{f.number}</td>
                    <td style={{ maxWidth: 420, whiteSpace: "normal" }}>
                      {f.question}
                      {f.last_error ? <div style={{ color: "var(--warn)", fontSize: 10.5 }}>{f.last_error}</div> : null}
                    </td>
                    <td className={f.pipeline_state === "resolved" || f.pipeline_state === "collected" ? t.pos : f.pipeline_state === "failed" || f.pipeline_state === "void" ? t.neg : ""}>
                      {f.pipeline_state.toUpperCase()}
                    </td>
                    <td>{fmtDate(f.deadline)}</td>
                    <td style={{ fontSize: 10.5, color: "var(--muted)" }}>{f.generated_by}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {f.pipeline_state === "draft" ? <Mini onClick={() => void act("approve", { id: f.id })}>APPROVE</Mini> : null}
                        {f.pipeline_state === "queued" && c.payer ? <Mini onClick={() => void act("dispatch", { id: f.id })}>PAY FORECAST 0.5</Mini> : null}
                        {f.pipeline_state === "forecasting" || f.pipeline_state === "resolving" ? <Mini onClick={() => void act("refresh", { id: f.id })}>REFRESH</Mini> : null}
                        {f.pipeline_state === "collected" && Date.parse(f.deadline) <= Date.now() && c.payer ? <Mini onClick={() => void act("resolve", { id: f.id })}>PAY RESOLVE 0.5</Mini> : null}
                        {f.pipeline_state === "failed" ? <Mini onClick={() => void act("requeue", { id: f.id })}>REQUEUE</Mini> : null}
                        {!["resolved", "void"].includes(f.pipeline_state) ? <Mini onClick={() => void act("void", { id: f.id })}>VOID</Mini> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </InstrumentPanel>

      <div className={p.two}>
        <InstrumentPanel label="IMD ORDERS" code="O-LEDGER" tone="dark">
          {state.orders.length === 0 ? (
            <Notice title="NO PAID ACTIONS YET" />
          ) : (
            <div className={t.tableWrap}>
              <table className={t.table}>
                <thead>
                  <tr>
                    <th>WHEN</th>
                    <th>ACTION</th>
                    <th>STATUS</th>
                    <th>RESULT</th>
                  </tr>
                </thead>
                <tbody>
                  {state.orders.map((o) => (
                    <tr key={o.id}>
                      <td>{fmtDate(o.created_at)}</td>
                      <td>
                        {o.action} / {o.purpose}
                      </td>
                      <td className={o.status === "admitted" ? t.pos : o.status === "failed" ? t.neg : ""}>{o.status.toUpperCase()}</td>
                      <td style={{ maxWidth: 260, whiteSpace: "normal", fontSize: 11 }}>{o.job_id ? `JOB ${o.job_id.slice(0, 8)}` : o.oracle_request_id ? `ORACLE ${o.oracle_request_id.slice(0, 8)}` : o.error ?? "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </InstrumentPanel>
        <TerminalWindow
          title="OPERATOR LOG"
          status={
            <button type="button" onClick={() => void fetch("/api/operator/logout", { method: "POST" }).then(load)} style={{ textDecoration: "underline" }}>
              LOG OUT
            </button>
          }
        >
          <div className={p.termLines} style={{ maxHeight: 420, overflow: "auto" }}>
            {busy ? <span>&gt; {busy.toUpperCase()}...</span> : null}
            {out.length ? out.map((l, i) => <span key={i} style={{ whiteSpace: "pre-wrap" }}>&gt; {l}</span>) : <span>&gt; READY</span>}
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
}

function OpInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "grid", gap: 3, fontSize: 9.5, letterSpacing: "0.14em" }}>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ background: "var(--term)", color: "var(--ph)", border: "1px solid #000", padding: "7px 8px", fontSize: 12 }} />
    </label>
  );
}

function OpSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "grid", gap: 3, fontSize: 9.5, letterSpacing: "0.14em" }}>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ background: "var(--term)", color: "var(--ph)", border: "1px solid #000", padding: "7px 6px", fontSize: 12 }}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function Mini({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ fontSize: 10, letterSpacing: "0.1em", padding: "3px 7px", border: "1px solid var(--line-2)", color: "var(--text)" }}>
      {children}
    </button>
  );
}
