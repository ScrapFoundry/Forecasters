import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { OperatorConsole } from "@/components/operator/OperatorConsole";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "OPERATOR", robots: { index: false, follow: false } };

export default function OperatorPage() {
  return (
    <>
      <PageHeader
        crumb={[{ label: "OPERATOR" }]}
        title="OPERATOR CONSOLE"
        sub="QUESTIONS IN. IMD AGENTS FORECAST. THE IMD ORACLE RESOLVES."
        aside={<Badge tone="sim">SPENDS IMD: 0.5 PER ACTION</Badge>}
      />
      <OperatorConsole />
    </>
  );
}
