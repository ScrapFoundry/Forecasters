/**
 * FORECASTERS WORKER (runs on your VPS, no paid cron needed)
 *
 * Drives the forecast pipeline with a smart sleep instead of a fixed cron:
 *   in flight work (jobs running / oracle resolving)  -> wake every 10 min
 *   waiting for a deadline                            -> wake at that deadline
 *   nothing to do                                     -> wake every 60 min
 *   operator pressed RUN TICK in /operator            -> wake within 60 s
 *
 * The payer key (OPERATOR_PRIVATE_KEY) and OPENAI_API_KEY live only here.
 * Start:  npm run worker   (production: pm2 start ecosystem.config.cjs, see DEPLOY.md)
 */
import { getSupabase } from "@/lib/supabase/server";
import { hasSupabase, hasPayer, serverConfig } from "@/lib/config/server";
import { resolveDueAt, tick } from "@/lib/forecasters/pipeline";
import { tokenConfig } from "@/lib/config/token";

const MIN = 60_000;
const BUSY_EVERY = 10 * MIN;
const IDLE_EVERY = 60 * MIN;
const POLL_FLAG_EVERY = 1 * MIN;

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (...a: unknown[]) => console.log(`[${stamp()}]`, ...a);

let stopping = false;
let wasLive = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function nextWakeMs(): Promise<number> {
  const db = getSupabase()!;
  const { count: busy } = await db.from("forecasts").select("id", { count: "exact", head: true }).in("pipeline_state", ["forecasting", "resolving"]);
  if ((busy ?? 0) > 0) return BUSY_EVERY;
  const { count: queued } = await db.from("forecasts").select("id", { count: "exact", head: true }).eq("pipeline_state", "queued");
  if ((queued ?? 0) > 0) return BUSY_EVERY; // queued but paid step was blocked (budget / pause): retry later
  const { data } = await db.from("forecasts").select("deadline, attempts").eq("pipeline_state", "collected").order("deadline", { ascending: true }).limit(20);
  const dues = (data ?? []).map((f) => resolveDueAt({ deadline: String(f.deadline), attempts: Number(f.attempts ?? 0) }));
  const next = dues.length ? Math.min(...dues) - Date.now() + 30_000 : Infinity;
  return Math.max(MIN, Math.min(IDLE_EVERY, next));
}

async function runNowRequested(): Promise<boolean> {
  const db = getSupabase()!;
  const { data } = await db.from("settings").select("value").eq("key", "run_now").maybeSingle();
  if (data?.value === true) {
    await db.from("settings").upsert({ key: "run_now", value: false, updated_at: new Date().toISOString() });
    return true;
  }
  return false;
}

async function heartbeat(note: string) {
  await getSupabase()!
    .from("settings")
    .upsert({ key: "worker_heartbeat", value: { at: new Date().toISOString(), note }, updated_at: new Date().toISOString() });
}

async function main() {
  if (!hasSupabase()) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  wasLive = tokenConfig().live;
  log(`worker up · token ${wasLive ? `LIVE ${tokenConfig().address}` : "PRE-LAUNCH (no TOKEN_ADDRESS yet)"} · payer ${hasPayer() ? "configured" : "MISSING"} · payments ${serverConfig.paymentsEnabled ? "ENABLED" : "disabled"} · budget ${serverConfig.dailyBudgetImd} IMD/day`);

  while (!stopping) {
    try {
      const report = await tick();
      report.log.filter((l) => !l.startsWith("rejected:")).forEach((l) => log(l));
      const wait = await nextWakeMs();
      await heartbeat(`next wake in ${Math.round(wait / MIN)} min`);
      log(`sleep ${Math.round(wait / MIN)} min`);
      const until = Date.now() + wait;
      let lastFlag = Date.now();
      while (!stopping && Date.now() < until) {
        await new Promise((r) => setTimeout(r, Math.min(5_000, until - Date.now())));
        if (Date.now() - lastFlag >= POLL_FLAG_EVERY) {
          lastFlag = Date.now();
          if (await runNowRequested().catch(() => false)) {
            log("RUN NOW requested from /operator");
            break;
          }
          // launch: the CA was just pasted into .env -> run immediately, no restart needed
          const liveNow = tokenConfig().live;
          if (liveNow && !wasLive) {
            wasLive = true;
            log(`TOKEN CA detected (${tokenConfig().address}). Launching now.`);
            break;
          }
          wasLive = liveNow;
        }
      }
    } catch (e) {
      log("tick error:", e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 5 * MIN));
    }
  }
  log("worker stopped");
}

void main();
