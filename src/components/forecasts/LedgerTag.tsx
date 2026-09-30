import { Badge, DemoBadge } from "@/components/ui/Badge";

/** States where forecast data comes from. Never omitted on forecast views. */
export function LedgerTag({ source }: { source: "supabase" | "demo" | "none" }) {
  if (source === "demo") return <DemoBadge />;
  if (source === "supabase") return <Badge tone="live">LEDGER ● LIVE</Badge>;
  return <Badge tone="err">NO LEDGER CONNECTED</Badge>;
}
