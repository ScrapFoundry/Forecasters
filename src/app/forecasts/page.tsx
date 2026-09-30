import type { Metadata } from "next";
import { getLedger } from "@/lib/forecasters/forecast";
import { buildBoard } from "@/lib/forecasters/board";
import { PageHeader } from "@/components/ui/PageHeader";
import { LedgerTag } from "@/components/forecasts/LedgerTag";
import { ForecastBrowser } from "@/components/forecasts/ForecastBrowser";
import { InstrumentPanel } from "@/components/ui/InstrumentPanel";
import { DigitalCounter } from "@/components/ui/DigitalCounter";
import { Notice } from "@/components/ui/SectionHeader";
import s from "@/components/ui/page.module.css";

export const metadata: Metadata = { title: "FORECASTS" };
export const revalidate = 60;

export default async function ForecastsPage() {
  const board = buildBoard(await getLedger());
  const code = board.source === "demo" ? "DEMO" : "LEDGER";
  return (
    <>
      <PageHeader
        crumb={[{ label: "FORECASTS" }]}
        title="FORECASTS"
        sub="QUESTIONS WITH DEADLINES. THE OUTCOME IS THE TEST."
        aside={<LedgerTag source={board.source} />}
      />
      {board.error ? (
        <div style={{ marginBottom: 16 }}>
          <Notice title="LEDGER ○ DEGRADED" tone="err">
            {board.error}
          </Notice>
        </div>
      ) : null}
      <div className={s.strip}>
        <InstrumentPanel label="QUESTIONS" code={code}>
          <DigitalCounter value={board.totals.forecasts} size="sm" />
        </InstrumentPanel>
        <InstrumentPanel label="OPEN" code={code}>
          <DigitalCounter value={board.totals.open} size="sm" />
        </InstrumentPanel>
        <InstrumentPanel label="RESOLVED" code={code}>
          <DigitalCounter value={board.totals.resolved} size="sm" />
        </InstrumentPanel>
        <InstrumentPanel label="PREDICTIONS" code={code}>
          <DigitalCounter value={board.totals.predictions} size="sm" />
        </InstrumentPanel>
        <InstrumentPanel label="FORECASTERS" code={code}>
          <DigitalCounter value={board.totals.forecasters} size="sm" />
        </InstrumentPanel>
      </div>
      {board.source === "none" ? (
        <Notice title="NO FORECAST LEDGER CONNECTED">
          SET SUPABASE_URL AND SUPABASE_SERVICE_ROLE_KEY (SEE supabase/schema.sql), OR SET NEXT_PUBLIC_DEMO_MODE=true FOR LABELED DEMO DATA.
        </Notice>
      ) : (
        <ForecastBrowser forecasts={board.forecasts} />
      )}
    </>
  );
}
