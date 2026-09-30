import { CRTScreen } from "@/components/terminal/CRTScreen";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div style={{ maxWidth: 760, margin: "40px auto" }}>
      <CRTScreen>
        <div style={{ padding: 28, display: "grid", gap: 10, fontSize: 13 }}>
          <div>&gt; LOOKUP 404</div>
          <div>&gt; NO RECORD AT THIS ADDRESS.</div>
          <div style={{ opacity: 0.6 }}>&gt; THE NETWORK ONLY KEEPS WHAT CAN BE VERIFIED.</div>
          <div style={{ marginTop: 12 }}>
            <Button variant="term" href="/">
              [ RETURN TO CONTROL ROOM ]
            </Button>
          </div>
        </div>
      </CRTScreen>
    </div>
  );
}
