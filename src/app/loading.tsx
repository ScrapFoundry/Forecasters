export default function Loading() {
  return (
    <div role="status" style={{ padding: "60px 0", textAlign: "center", color: "var(--ph)", letterSpacing: "0.2em", fontSize: 12 }}>
      &gt; SYNCING PANEL<span style={{ animation: "fc-blink 1s steps(1) infinite" }}>_</span>
    </div>
  );
}
