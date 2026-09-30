"use client";

import { useState } from "react";
import { SwarmCanvas, SwarmLegend, type SwarmOverlay } from "./SwarmCanvas";
import { Switch } from "@/components/ui/Switch";
import { DemoBadge, Badge } from "@/components/ui/Badge";
import { InstrumentPanel } from "@/components/ui/InstrumentPanel";
import { TerminalWindow } from "@/components/terminal/TerminalWindow";
import { TerminalLog } from "@/components/terminal/TerminalLog";
import { useLive } from "@/components/shell/LiveDataProvider";
import s from "./swarm.module.css";
import p from "@/components/ui/page.module.css";

export function SwarmRoom({ overlay, latest }: { overlay: SwarmOverlay | null; latest: { number: number; question: string; result: string | null } | null }) {
  const [on, setOn] = useState(false);
  const live = useLive();
  return (
    <>
      <div className={s.controls}>
        <Badge tone="live">NODES: LIVE IMD /SWARM</Badge>
        {overlay ? <Switch on={on} onChange={setOn} label="FORECAST OVERLAY" /> : <Badge tone="err">NO FORECAST LEDGER</Badge>}
        {on && overlay?.demo ? <DemoBadge label="OVERLAY: DEMO DATA" /> : null}
        {on && latest ? (
          <span style={{ fontSize: 10.5, letterSpacing: "0.12em", color: "var(--muted)" }}>
            ✓ / × = LATEST RESOLUTION #{String(latest.number).padStart(5, "0")} ({latest.result})
          </span>
        ) : null}
      </div>
      <SwarmCanvas height={640} overlay={on ? overlay : null} />
      <SwarmLegend withOverlay={on} />
      <div className={p.gap} />
      <div className={p.twoWide}>
        <TerminalWindow title="SWARM EVENTS" status={<span>{live.events.length} RECENT</span>}>
          <div style={{ maxHeight: 360, overflow: "hidden" }}>
            <TerminalLog events={live.events.filter((e) => e.kind === "seat")} max={16} />
          </div>
        </TerminalWindow>
        <InstrumentPanel label="READING THE SWARM" code="SW-01">
          <p style={{ fontSize: 12, lineHeight: 1.7 }}>
            Every node is an IMD seat from /swarm, ordered by token id on a spiral. WORKING nodes pulse and link to the core. A ripple marks a
            seat whose last work changed since the previous sync. ONLINE here means work in the last six hours; IMD presence per seat is on
            each dossier.
          </p>
          <p style={{ fontSize: 12, lineHeight: 1.7 }}>
            The forecast overlay colors agents with open predictions (FORECASTING), agents on closed questions (RESOLVING) and marks the latest
            resolution with ✓ or ×. Click a node to open its dossier.
          </p>
        </InstrumentPanel>
      </div>
    </>
  );
}
