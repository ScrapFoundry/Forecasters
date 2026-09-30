import type { ReactNode } from "react";
import s from "./hardware.module.css";

export function Badge({ tone = "muted", children, title }: { tone?: "demo" | "sim" | "live" | "muted" | "ink" | "err"; children: ReactNode; title?: string }) {
  return (
    <span className={[s.badge, s[tone]].join(" ")} title={title}>
      {children}
    </span>
  );
}

/** Mandatory label on any value that is not real network data. */
export function DemoBadge({ label = "DEMO DATA" }: { label?: string }) {
  return (
    <Badge tone="demo" title="Seeded sample data. Not produced by IMD agents.">
      {label}
    </Badge>
  );
}
