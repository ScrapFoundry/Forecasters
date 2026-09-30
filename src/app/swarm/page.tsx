import type { Metadata } from "next";
import { getLedger } from "@/lib/forecasters/forecast";
import { swarmOverlay } from "@/lib/forecasters/board";
import { PageHeader } from "@/components/ui/PageHeader";
import { SwarmRoom } from "@/components/swarm/SwarmRoom";

export const metadata: Metadata = { title: "SWARM" };
export const revalidate = 60;

export default async function SwarmPage() {
  const ledger = await getLedger();
  const ov = swarmOverlay(ledger);
  const overlay = ledger.source === "none" ? null : { forecasting: ov.forecasting, resolving: ov.resolving, correct: ov.correct, incorrect: ov.incorrect, demo: ov.demo };
  return (
    <>
      <PageHeader crumb={[{ label: "SWARM" }]} title="THE SWARM" sub="A LIVING MAP OF IMD SEATS. THE NETWORK IS WATCHING." />
      <SwarmRoom overlay={overlay} latest={ov.latestResolved} />
    </>
  );
}
