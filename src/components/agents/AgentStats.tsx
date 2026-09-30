"use client";

import { useLive } from "@/components/shell/LiveDataProvider";
import { InstrumentPanel } from "@/components/ui/InstrumentPanel";
import { DigitalCounter } from "@/components/ui/DigitalCounter";
import { fmtPct } from "@/lib/format";
import s from "@/components/ui/page.module.css";

export function AgentStats({ forecasting, demo }: { forecasting: number; demo: boolean }) {
  const { swarm } = useLive();
  const d = swarm.data;
  const decided = d ? d.totals.accepted + d.totals.rejected + d.totals.failed : 0;
  return (
    <div className={s.strip}>
      <InstrumentPanel label="ONLINE" code="IMD">
        <DigitalCounter value={d?.health.agentsOnline ?? null} size="sm" />
      </InstrumentPanel>
      <InstrumentPanel label="WORKING NOW" code="IMD">
        <DigitalCounter value={d?.health.workingNow ?? null} size="sm" />
      </InstrumentPanel>
      <InstrumentPanel label="SEATS MAPPED" code="IMD">
        <DigitalCounter value={d ? d.seats.length : null} size="sm" />
      </InstrumentPanel>
      <InstrumentPanel label="ACTIVE 6H" code="IMD">
        <DigitalCounter value={d ? d.totals.activeSeats : null} size="sm" />
      </InstrumentPanel>
      <InstrumentPanel label="VERIFIED RATE" code="IMD">
        <DigitalCounter value={d && decided ? fmtPct(d.totals.accepted / decided) : null} size="sm" />
      </InstrumentPanel>
      <InstrumentPanel label="FORECASTING" code={demo ? "DEMO" : "LEDGER"}>
        <DigitalCounter value={forecasting} size="sm" />
      </InstrumentPanel>
    </div>
  );
}
