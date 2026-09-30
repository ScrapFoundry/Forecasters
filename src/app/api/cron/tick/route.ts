import { timingSafeEqual } from "node:crypto";
import { serverConfig, hasSupabase } from "@/lib/config/server";
import { tick } from "@/lib/forecasters/pipeline";

export const maxDuration = 60;

/**
 * Pipeline heartbeat. Call every 10 to 15 minutes:
 *   Vercel Cron (sends Authorization: Bearer $CRON_SECRET), or
 *   VPS: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/tick
 */
export async function GET(req: Request) {
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${serverConfig.cronSecret}`);
  if (!serverConfig.cronSecret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!hasSupabase()) return Response.json({ error: "supabase not configured" }, { status: 503 });
  const report = await tick();
  return Response.json(report, { headers: { "Cache-Control": "no-store" } });
}
