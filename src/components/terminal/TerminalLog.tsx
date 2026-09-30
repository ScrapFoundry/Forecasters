"use client";

import Link from "next/link";
import type { NetworkEvent } from "@/lib/imd/types";
import { fmtClock } from "@/lib/format";
import { useNow } from "@/components/shell/useNow";
import s from "./crt.module.css";

/** Streaming event log. Events are real IMD derived records, newest first. */
export function TerminalLog({ events, max = 16, showCursor = true }: { events: NetworkEvent[]; max?: number; showCursor?: boolean }) {
  const mounted = useNow(0) > 0;
  const list = events.slice(0, max);
  return (
    <ol className={s.log} aria-live="polite" aria-label="network events">
      {list.map((e) => (
        <li key={e.id} className={[s.logLine, s[`k-${e.kind}`]].join(" ")}>
          <span className={s.logPrompt}>&gt;</span>
          <span className={s.logTime}>{mounted ? fmtClock(e.at) : "--:--"}</span>
          <span className={s.logText}>{e.ref ? <Link href={e.ref}>{e.text}</Link> : e.text}</span>
        </li>
      ))}
      {showCursor ? (
        <li className={s.logLine}>
          <span className={s.logPrompt}>&gt;</span>
          <span className={s.cursor} aria-hidden />
          <span />
        </li>
      ) : null}
    </ol>
  );
}
