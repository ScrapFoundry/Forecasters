import { isOperator } from "@/lib/operator/session";
import { hasGenerator, hasPayer, hasSupabase, serverConfig } from "@/lib/config/server";
import { budget, isPaused, recentOrders } from "@/lib/forecasters/orders";
import { pipelineOverview } from "@/lib/forecasters/pipeline";
import { walletStatus } from "@/lib/imd/paid";
import { getSupabase } from "@/lib/supabase/server";
import { tokenConfig } from "@/lib/config/token";

export async function GET() {
  if (!(await isOperator())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const config = {
    supabase: hasSupabase(),
    payer: hasPayer(),
    paymentsEnabled: serverConfig.paymentsEnabled,
    generator: hasGenerator(),
    model: serverConfig.openaiModel,
    generateMode: serverConfig.generateMode,
    perDay: serverConfig.questionsPerDay,
    forecastPanel: serverConfig.forecastPanel,
    oraclePanel: serverConfig.oraclePanel,
    oracleQuorum: serverConfig.oracleQuorum,
    dailyBudgetImd: serverConfig.dailyBudgetImd,
    cron: Boolean(serverConfig.cronSecret),
  };
  const [wallet, b, paused, forecasts, orders] = await Promise.all([
    config.payer ? walletStatus().catch((e: unknown) => ({ error: String(e) })) : Promise.resolve(null),
    config.supabase ? budget().catch(() => null) : Promise.resolve(null),
    config.supabase ? isPaused().catch(() => null) : Promise.resolve(null),
    config.supabase ? pipelineOverview().catch(() => []) : Promise.resolve([]),
    config.supabase ? recentOrders(25).catch(() => []) : Promise.resolve([]),
  ]);
  const worker = config.supabase
    ? await getSupabase()!.from("settings").select("value").eq("key", "worker_heartbeat").maybeSingle().then((r) => r.data?.value ?? null, () => null)
    : null;
  const launched = config.supabase
    ? await getSupabase()!.from("settings").select("value").eq("key", "launched_at").maybeSingle().then((r) => r.data?.value ?? null, () => null)
    : null;
  return Response.json({ config, wallet, budget: b, paused, forecasts, orders, worker, token: tokenConfig(), launched }, { headers: { "Cache-Control": "no-store" } });
}
