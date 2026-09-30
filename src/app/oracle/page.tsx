import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { OracleTerminal } from "@/components/oracle/OracleTerminal";
import { OracleLedger } from "@/components/oracle/OracleLedger";
import { OracleStats } from "@/components/oracle/OracleStats";
import { TerminalWindow } from "@/components/terminal/TerminalWindow";
import { InstrumentPanel } from "@/components/ui/InstrumentPanel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import s from "@/components/ui/page.module.css";

export const metadata: Metadata = { title: "ORACLE" };

export default function OraclePage() {
  return (
    <>
      <PageHeader
        crumb={[{ label: "ORACLE" }]}
        title="ASK THE FORECASTERS"
        sub="THE CHAPTER 27 PROTOCOL: ASK THE TOP FIVE, COMPARE THE PLANS, SEE WHO DISSENTS."
        aside={
          <>
            <Badge tone="live">ORACLE LEDGER: LIVE IMD</Badge>
            <Button href="/snowmoon" variant="ghost">
              WHY CHAPTER 27 ›
            </Button>
          </>
        }
      />
      <OracleStats />
      <div className={s.twoWide}>
        <OracleTerminal />
        <div className={s.stack}>
          <InstrumentPanel label="SELECTED FORECASTERS" code="SEL-05">
            <p style={{ fontSize: 12, lineHeight: 1.65 }}>
              As in Snowmoon chapter 27, the question does not go to one oracle: it goes to the five best forecasters on the public
              leaderboard. At least five resolved forecasts, ranked by (correct + 1) / (resolved + 2), tie broken by sample size and recent
              performance. With no forecast record yet, selection falls back to the verified work record IMD publishes, and says so.
            </p>
          </InstrumentPanel>
          <InstrumentPanel label="WHAT IS REAL HERE" code="TRUTH" tone="dark">
            <div className={s.darkKv}>
              <div className={s.kv}>
                <span>AGENT SELECTION</span>
                <span style={{ color: "var(--ph)" }}>REAL RANKING</span>
              </div>
              <div className={s.kv}>
                <span>ORACLE LEDGER</span>
                <span style={{ color: "var(--ph)" }}>LIVE IMD</span>
              </div>
              <div className={s.kv}>
                <span>RELATED EVIDENCE</span>
                <span style={{ color: "var(--ph)" }}>LIVE IMD</span>
              </div>
              <div className={s.kv}>
                <span>AD HOC DISPATCH</span>
                <span style={{ color: "var(--warn)" }}>NOT FROM THIS SCREEN</span>
              </div>
              <div className={s.kv}>
                <span>LEDGER FORECASTS</span>
                <span style={{ color: "var(--ph)" }}>PAID IMD JOBS</span>
              </div>
            </div>
          </InstrumentPanel>
        </div>
      </div>

      <div className={s.gap} />
      <SectionHeader idx="IMD // ORACLE REQUESTS" title="ORACLE LEDGER" sub="ATTESTED BY A PANEL OF IMD AGENTS. SELECT A ROW FOR THE CONSENSUS ANSWER." />
      <TerminalWindow title="IMD ORACLE // REQUESTS" status={<span>/ORACLE/REQUESTS</span>}>
        <Suspense fallback={<div style={{ fontSize: 12 }}>&gt; LOADING...</div>}>
          <OracleLedger />
        </Suspense>
      </TerminalWindow>
    </>
  );
}
