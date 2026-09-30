"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ImdResult, Job, NetworkEvent, OracleLedger, Swarm } from "@/lib/imd/types";
import { deriveEvents } from "@/lib/imd/swarm";
import { POLL, STALE_FACTOR } from "@/lib/config/public";

/**
 * Centralized polling. The ONLY place in the client that talks to the IMD
 * proxy routes on a timer. Components read from context instead of fetching.
 *
 *   swarm   /api/imd/swarm            every 10s
 *   jobs    /api/imd/jobs             every 15s
 *   oracle  /api/imd/oracle/requests  every 15s
 *
 * Timers pause while the tab is hidden and back off after failures.
 */

export type FeedName = "swarm" | "jobs" | "oracle";
export type FeedStatus = "ONLINE" | "SYNCING" | "STALE" | "DEGRADED" | "OFFLINE";

interface Feed<T> {
  data: T | null;
  error: string | null;
  lastSuccess: number | null;
  lastAttempt: number | null;
  failures: number;
  syncing: boolean;
}

const emptyFeed = <T,>(): Feed<T> => ({ data: null, error: null, lastSuccess: null, lastAttempt: null, failures: 0, syncing: true });

interface LiveState {
  swarm: Feed<Swarm>;
  jobs: Feed<Job[]>;
  oracle: Feed<OracleLedger>;
  events: NetworkEvent[];
  status: (f: FeedName, now: number) => FeedStatus;
  overall: (now: number) => "OPERATIONAL" | "DEGRADED" | "OFFLINE" | "SYNCING";
  refresh: (f?: FeedName) => void;
}

const LiveContext = createContext<LiveState | null>(null);

const ENDPOINT: Record<FeedName, string> = {
  swarm: "/api/imd/swarm",
  jobs: "/api/imd/jobs",
  oracle: "/api/imd/oracle/requests",
};

const INTERVAL: Record<FeedName, number> = { swarm: POLL.swarm, jobs: POLL.jobs, oracle: POLL.oracle };

export function feedStatus(feed: Feed<unknown>, interval: number, now: number): FeedStatus {
  if (feed.lastSuccess === null) return feed.failures > 0 ? "OFFLINE" : "SYNCING";
  if (feed.error) return "DEGRADED";
  if (now > 0 && now - feed.lastSuccess > interval * STALE_FACTOR) return "STALE";
  return "ONLINE";
}

export function LiveDataProvider({ children }: { children: ReactNode }) {
  const [swarm, setSwarm] = useState<Feed<Swarm>>(emptyFeed);
  const [jobs, setJobs] = useState<Feed<Job[]>>(emptyFeed);
  const [oracle, setOracle] = useState<Feed<OracleLedger>>(emptyFeed);
  const timers = useRef<Partial<Record<FeedName, ReturnType<typeof setTimeout>>>>({});
  const failures = useRef<Record<FeedName, number>>({ swarm: 0, jobs: 0, oracle: 0 });
  const runners = useRef<Partial<Record<FeedName, () => void>>>({});

  useEffect(() => {
    let alive = true;
    const setters = { swarm: setSwarm, jobs: setJobs, oracle: setOracle } as const;

    const run = async (name: FeedName) => {
      clearTimeout(timers.current[name]);
      const set = setters[name] as React.Dispatch<React.SetStateAction<Feed<unknown>>>;
      set((f) => ({ ...f, syncing: true }));
      let ok = false;
      try {
        const res = await fetch(ENDPOINT[name], { cache: "no-store" });
        const body = (await res.json()) as ImdResult<unknown>;
        if (!alive) return;
        if (body.ok) {
          ok = true;
          failures.current[name] = 0;
          set(() => ({ data: body.data, error: null, lastSuccess: Date.now(), lastAttempt: Date.now(), failures: 0, syncing: false }));
        } else {
          failures.current[name] += 1;
          set((f) => ({ ...f, error: body.error, lastAttempt: Date.now(), failures: failures.current[name], syncing: false }));
        }
      } catch {
        if (!alive) return;
        failures.current[name] += 1;
        set((f) => ({ ...f, error: "network error", lastAttempt: Date.now(), failures: failures.current[name], syncing: false }));
      }
      if (!alive) return;
      const backoff = ok ? 1 : Math.min(4, 2 ** Math.min(2, failures.current[name]));
      if (!document.hidden) {
        timers.current[name] = setTimeout(() => void run(name), INTERVAL[name] * backoff);
      }
    };

    (Object.keys(ENDPOINT) as FeedName[]).forEach((n, i) => {
      runners.current[n] = () => void run(n);
      // stagger initial requests slightly
      timers.current[n] = setTimeout(() => void run(n), i * 120);
    });

    const onVis = () => {
      if (document.hidden) {
        (Object.keys(ENDPOINT) as FeedName[]).forEach((n) => clearTimeout(timers.current[n]));
      } else {
        (Object.keys(ENDPOINT) as FeedName[]).forEach((n) => void run(n));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      (Object.keys(ENDPOINT) as FeedName[]).forEach((n) => clearTimeout(timers.current[n]));
    };
  }, []);

  const events = useMemo(
    () => deriveEvents(swarm.data, jobs.data, oracle.data?.requests ?? null, 80),
    [swarm.data, jobs.data, oracle.data],
  );

  const value = useMemo<LiveState>(() => {
    const status = (f: FeedName, now: number) =>
      feedStatus(f === "swarm" ? swarm : f === "jobs" ? jobs : oracle, INTERVAL[f], now);
    return {
      swarm,
      jobs,
      oracle,
      events,
      status,
      overall: (now) => {
        const all = (["swarm", "jobs", "oracle"] as FeedName[]).map((f) => status(f, now));
        if (all.every((s) => s === "SYNCING")) return "SYNCING";
        if (all.every((s) => s === "OFFLINE")) return "OFFLINE";
        if (all.every((s) => s === "ONLINE")) return "OPERATIONAL";
        if (all.some((s) => s === "SYNCING") && !all.some((s) => s === "OFFLINE" || s === "DEGRADED")) return "SYNCING";
        return "DEGRADED";
      },
      refresh: (f) => {
        const list = f ? [f] : (["swarm", "jobs", "oracle"] as FeedName[]);
        list.forEach((n) => runners.current[n]?.());
      },
    };
  }, [swarm, jobs, oracle, events]);

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveState {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error("useLive must be used inside LiveDataProvider");
  return ctx;
}
