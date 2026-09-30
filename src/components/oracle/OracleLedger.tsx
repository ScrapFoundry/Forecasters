"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLive } from "@/components/shell/LiveDataProvider";
import { useNow } from "@/components/shell/useNow";
import type { ImdResult, OracleRequest } from "@/lib/imd/types";
import { attestLatency, isAttested } from "@/lib/imd/oracle";
import { fmtAgo, fmtDate, shortAddr, UNKNOWN } from "@/lib/format";
import s from "@/components/ui/page.module.css";

/** Live ledger of real IMD oracle requests with on demand detail (consensus answer). */
export function OracleLedger({ limit = 25 }: { limit?: number }) {
  const live = useLive();
  const now = useNow(5000);
  const params = useSearchParams();
  const [open, setOpen] = useState<string | null>(params.get("request"));
  const [detail, setDetail] = useState<Record<string, ImdResult<OracleRequest> | "loading">>({});
  const requests = live.oracle.data?.requests;

  useEffect(() => {
    if (!open || detail[open]) return;
    setDetail((d) => ({ ...d, [open]: "loading" }));
    fetch(`/api/imd/oracle/requests/${open}`)
      .then((r) => r.json() as Promise<ImdResult<OracleRequest>>)
      .then((body) => setDetail((d) => ({ ...d, [open]: body })))
      .catch(() =>
        setDetail((d) => ({ ...d, [open]: { ok: false, data: null, error: "network error", fetchedAt: Date.now(), source: "imd" } })),
      );
  }, [open, detail]);

  if (!requests) {
    return (
      <div style={{ fontSize: 12 }}>
        &gt; {live.oracle.failures > 0 ? `ORACLE FEED ○ DEGRADED (${live.oracle.error ?? "unreachable"})` : "SYNCING ORACLE LEDGER..."}
      </div>
    );
  }
  if (requests.length === 0) return <div style={{ fontSize: 12 }}>&gt; NO ORACLE REQUESTS REPORTED</div>;

  return (
    <div>
      {requests.slice(0, limit).map((r) => {
        const d = detail[r.id];
        const full = d && d !== "loading" && d.ok ? d.data : null;
        const lat = attestLatency(r);
        return (
          <div key={r.id}>
            <button type="button" className={s.ledgerRow} onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}>
              <span>{r.id.slice(0, 4).toUpperCase()}</span>
              <span className={s.ledgerQ}>{r.question || "(NO QUESTION TEXT)"}</span>
              <span style={{ opacity: 0.75 }}>{now ? fmtAgo(r.createdAt, now) : "--"}</span>
              <span style={{ color: isAttested(r) ? "var(--ph)" : "var(--warn)", textShadow: "none" }}>{isAttested(r) ? "● ATTESTED" : `○ ${r.status.toUpperCase()}`}</span>
            </button>
            {open === r.id ? (
              <div className={s.ledgerDetail}>
                <span>&gt; {r.question}</span>
                {d === "loading" ? <span>&gt; READING REQUEST...</span> : null}
                {full?.consensusAnswer ? (
                  <span style={{ fontSize: 16, fontWeight: 600 }}>&gt; CONSENSUS ANSWER: {full.consensusAnswer}</span>
                ) : d && d !== "loading" ? (
                  <span style={{ opacity: 0.7 }}>&gt; CONSENSUS ANSWER: {d.ok ? "NOT PUBLISHED" : "DATA UNAVAILABLE"}</span>
                ) : null}
                {full?.note ? <span style={{ opacity: 0.85 }}>&gt; {full.note}</span> : null}
                <span style={{ opacity: 0.7 }}>
                  &gt; CHAIN {r.chainId ?? UNKNOWN} · BLOCKS {r.window.fromBlock ?? "?"} TO {r.window.toBlock ?? "?"} · TYPE {r.answerType ?? UNKNOWN}
                </span>
                {full ? (
                  <span style={{ opacity: 0.7 }}>
                    &gt; EVIDENCE {full.evidence ?? UNKNOWN} · PANEL {full.panelSize ?? "?"} · QUORUM {full.quorum ?? "?"}
                  </span>
                ) : null}
                <span style={{ opacity: 0.7 }}>
                  &gt; SIGNER {shortAddr(r.signer)} · ATTESTED {r.attestedAt ? fmtDate(r.attestedAt) : "PENDING"} {lat !== null ? `· ${Math.round(lat)}s` : ""}
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
