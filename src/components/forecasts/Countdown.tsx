"use client";

import { useNow } from "@/components/shell/useNow";
import { timeRemaining } from "@/lib/forecasters/resolution";

export function Countdown({ deadline }: { deadline: string }) {
  const now = useNow(30_000);
  if (now === 0) return <span>--H --M</span>;
  return <span>{timeRemaining(deadline, now).label}</span>;
}
