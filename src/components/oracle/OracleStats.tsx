"use client";

import { useLive } from "@/components/shell/LiveDataProvider";
import { InstrumentPanel } from "@/components/ui/InstrumentPanel";
import { DigitalCounter } from "@/components/ui/DigitalCounter";
import { attestLatency, isAttested } from "@/lib/imd/oracle";
import s from "@/components/ui/page.module.css";

export function OracleStats() {
  const { oracle, swarm } = useLive();
  const reqs = oracle.data?.requests ?? null;
  const att = reqs ? reqs.filter(isAttested) : null;
  const lats = att ? att.map(attestLatency).filter((x): x is number => x !== null) : [];
  const avg = lats.length ? `${Math.round(lats.reduce((a, b) => a + b, 0) / lats.length)}s` : null;
  return (
    <div className={s.strip}>
      <InstrumentPanel label="ORACLES 24H" code="IMD">
        <DigitalCounter value={swarm.data?.health.oraclesDoneLastDay ?? null} size="sm" />
      </InstrumentPanel>
      <InstrumentPanel label="RECENT REQUESTS" code="IMD">
        <DigitalCounter value={reqs ? reqs.length : null} size="sm" />
      </InstrumentPanel>
      <InstrumentPanel label="ATTESTED" code="IMD">
        <DigitalCounter value={att ? att.length : null} size="sm" />
      </InstrumentPanel>
      <InstrumentPanel label="PENDING" code="IMD">
        <DigitalCounter value={reqs && att ? reqs.length - att.length : null} size="sm" warn />
      </InstrumentPanel>
      <InstrumentPanel label="AVG ATTEST TIME" code="IMD">
        <DigitalCounter value={avg} size="sm" />
      </InstrumentPanel>
    </div>
  );
}
