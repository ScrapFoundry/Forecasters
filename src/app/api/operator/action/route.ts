import { isOperator } from "@/lib/operator/session";
import { hasPayer, hasSupabase, serverConfig } from "@/lib/config/server";
import { CATEGORIES } from "@/lib/forecasters/types";
import { generateQuestions, validateQuestion, type GeneratedQuestion } from "@/lib/forecasters/generator";
import {
  advanceForecasting,
  advanceResolving,
  approveDraft,
  createForecast,
  dispatchForecast,
  dispatchResolution,
  fromGenerated,
  recentQuestions,
  requeue,
  tick,
  voidForecast,
  type ForecastRow,
} from "@/lib/forecasters/pipeline";
import { setPaused } from "@/lib/forecasters/orders";
import { probe } from "@/lib/forecasters/probe";
import { approvePermit2 } from "@/lib/imd/paid";
import { getSupabase } from "@/lib/supabase/server";

export const maxDuration = 60;

type Body = { type?: string; id?: string; paused?: boolean; count?: number; questions?: GeneratedQuestion[]; question?: GeneratedQuestion };

async function forecastById(id: string): Promise<ForecastRow | null> {
  const { data } = await getSupabase()!.from("forecasts").select("*").eq("id", id).maybeSingle();
  return (data as ForecastRow | null) ?? null;
}

export async function POST(req: Request) {
  if (!(await isOperator())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Body;
  const log: string[] = [];
  try {
    switch (body.type) {
      case "probe":
        return Response.json({ ok: true, probe: await probe() });
      case "approve-permit2":
        return Response.json({ ok: true, txHash: await approvePermit2() });
    }
    if (!hasSupabase()) return Response.json({ error: "Supabase is required" }, { status: 503 });

    switch (body.type) {
      case "tick":
        if (!hasPayer()) {
          // payer key lives on the VPS worker: ask it to run now
          await getSupabase()!.from("settings").upsert({ key: "run_now", value: true, updated_at: new Date().toISOString() });
          return Response.json({ ok: true, log: ["worker asked to run now (within 60s)"] });
        }
        return Response.json({ ok: true, report: await tick() });
      case "pause":
        await setPaused(Boolean(body.paused));
        return Response.json({ ok: true });
      case "generate": {
        const g = await generateQuestions(Math.min(5, Math.max(1, body.count ?? 3)), await recentQuestions());
        return Response.json({ ok: true, preview: g });
      }
      case "publish": {
        const recent = await recentQuestions();
        for (const q of body.questions ?? []) {
          const why = validateQuestion(q, recent);
          if (why) {
            log.push(`skipped (${why}): ${q.question}`);
            continue;
          }
          const row = await createForecast(fromGenerated(q, serverConfig.openaiModel, false));
          log.push(`published #${row.number}`);
          recent.push(q.question);
        }
        return Response.json({ ok: true, log });
      }
      case "create": {
        const q = body.question;
        if (!q || !CATEGORIES.includes(q.category)) return Response.json({ error: "invalid question" }, { status: 400 });
        const why = validateQuestion({ ...q, deadlineHours: Math.round(q.deadlineHours) }, await recentQuestions());
        if (why) return Response.json({ error: why }, { status: 400 });
        const row = await createForecast({ ...fromGenerated(q, "operator", false), generatedBy: "operator" });
        return Response.json({ ok: true, log: [`created #${row.number}`] });
      }
    }

    const f = body.id ? await forecastById(body.id) : null;
    if (!f) return Response.json({ error: "forecast not found" }, { status: 404 });
    switch (body.type) {
      case "approve":
        await approveDraft(f.id);
        break;
      case "void":
        await voidForecast(f.id, "voided by operator");
        break;
      case "requeue":
        await requeue(f.id);
        break;
      case "dispatch":
        await dispatchForecast(f, log);
        break;
      case "resolve":
        if (Date.parse(f.deadline) > Date.now()) return Response.json({ error: "deadline not reached" }, { status: 400 });
        await dispatchResolution(f, log);
        break;
      case "refresh":
        if (f.pipeline_state === "forecasting") await advanceForecasting(f, log);
        else if (f.pipeline_state === "resolving") await advanceResolving(f, log);
        break;
      default:
        return Response.json({ error: "unknown action" }, { status: 400 });
    }
    return Response.json({ ok: true, log });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "action failed", log }, { status: 500 });
  }
}
