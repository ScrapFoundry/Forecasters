"use client";

import { useEffect } from "react";
import { CRTScreen } from "@/components/terminal/CRTScreen";
import { Button } from "@/components/ui/Button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[forecasters] render fault", error.digest ?? error.message);
  }, [error]);
  return (
    <div style={{ maxWidth: 760, margin: "40px auto" }}>
      <CRTScreen glitch>
        <div style={{ padding: 28, display: "grid", gap: 10, fontSize: 13 }}>
          <div>&gt; SYSTEM FAULT</div>
          <div style={{ color: "var(--warn)" }}>&gt; A PANEL FAILED TO RENDER. THE NETWORK IS UNAFFECTED.</div>
          {error.digest ? <div style={{ opacity: 0.6 }}>&gt; REF {error.digest}</div> : null}
          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <Button variant="term" onClick={reset}>
              [ RETRY ]
            </Button>
            <Button variant="ghost" href="/">
              [ RETURN ]
            </Button>
          </div>
        </div>
      </CRTScreen>
    </div>
  );
}
