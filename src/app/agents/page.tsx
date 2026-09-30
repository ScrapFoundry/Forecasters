import type { Metadata } from "next";
import { getLedger } from "@/lib/forecasters/forecast";
import { buildBoard, swarmOverlay } from "@/lib/forecasters/board";
import { PageHeader } from "@/components/ui/PageHeader";
import { AgentGrid } from "@/components/agents/AgentGrid";
import { AgentStats } from "@/components/agents/AgentStats";
import { LedgerTag } from "@/components/forecasts/LedgerTag";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "IMD AGENTS" };
export const revalidate = 60;

export default async function AgentsPage() {
  const ledger = await getLedger();
  const board = buildBoard(ledger);
  const overlay = swarmOverlay(ledger);
  return (
    <>
      <PageHeader
        crumb={[{ label: "AGENTS" }]}
        title="IMD AGENTS"
        sub="CURRENT NETWORK ACTIVITY. THE NETWORK IS WATCHING."
        aside={
          <>
            <Badge tone="live">WORK RECORD: LIVE IMD</Badge>
            <LedgerTag source={board.source} />
          </>
        }
      />
      <AgentStats forecasting={overlay.forecasting.length} demo={board.source === "demo"} />
      <AgentGrid records={board.records} demo={board.source === "demo"} />
    </>
  );
}
