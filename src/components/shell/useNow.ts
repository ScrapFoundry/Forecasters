"use client";

import { useEffect, useState } from "react";

/**
 * Ticking clock. Returns 0 during SSR and the first client render so time
 * dependent text never causes a hydration mismatch. Pass 0 to only detect mount.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    if (intervalMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
