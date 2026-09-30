"use client";

import { useState } from "react";

/** Agent seat image through the proxy, with a NO SIGNAL fallback. */
export function Portrait({ tokenId }: { tokenId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span style={{ color: "var(--ph-2)", fontSize: 11, letterSpacing: "0.2em" }}>NO SIGNAL</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/api/imd/agents/${tokenId}/image`} alt={`IMD #${tokenId} seat image`} width={240} height={240} onError={() => setFailed(true)} />
  );
}
