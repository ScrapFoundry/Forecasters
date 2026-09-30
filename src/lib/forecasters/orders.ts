import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "@/lib/supabase/server";
import { hasPayer, serverConfig } from "@/lib/config/server";
import { getOrder, payOrder, PaidRequestError, quote, type PaidAction } from "@/lib/imd/paid";

/**
 * Paid IMD actions with a persistent ledger (table imd_orders).
 * The ledger is also the budget: spend today = submitted + admitted orders.
 */

export interface OrderRow {
  id: string;
  request_key: string;
  action: PaidAction;
  purpose: "forecast" | "resolution" | "condition";
  forecast_id: string | null;
  order_id: string | null;
  status: string;
  amount_wei: string | null;
  job_id: string | null;
  oracle_request_id: string | null;
  tx_hash: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** numeric columns arrive as JSON numbers or strings; never trust exponent notation. */
function toWei(v: unknown): bigint {
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n)) : BigInt(serverConfig.maxPricePerAction);
}

const SPENDING = ["submitted", "admission_pending", "payment_pending", "admitted"];
const WEI = 10n ** 18n;

function db() {
  const d = getSupabase();
  if (!d) throw new Error("Supabase is required for the paid pipeline");
  return d;
}

export async function isPaused(): Promise<boolean> {
  const { data } = await db().from("settings").select("value").eq("key", "paused").maybeSingle();
  return data?.value === true;
}

export async function setPaused(paused: boolean): Promise<void> {
  await db().from("settings").upsert({ key: "paused", value: paused, updated_at: new Date().toISOString() });
}

export async function spentTodayWei(): Promise<bigint> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await db().from("imd_orders").select("amount_wei, status").gte("created_at", start.toISOString());
  return (data ?? [])
    .filter((r) => SPENDING.includes(String(r.status)))
    .reduce((s, r) => s + toWei(r.amount_wei), 0n);
}

export async function budget(): Promise<{ spentImd: number; limitImd: number; remainingActions: number }> {
  const spent = await spentTodayWei();
  const limit = BigInt(serverConfig.dailyBudgetImd) * WEI;
  const price = BigInt(serverConfig.maxPricePerAction);
  const remaining = spent >= limit ? 0 : Number((limit - spent) / price);
  return { spentImd: Number(spent) / 1e18, limitImd: serverConfig.dailyBudgetImd, remainingActions: remaining };
}

export type CanPay = { ok: true } | { ok: false; reason: string };

export async function canPay(): Promise<CanPay> {
  if (!serverConfig.paymentsEnabled) return { ok: false, reason: "PAYMENTS DISABLED (IMD_PAYMENTS_ENABLED)" };
  if (!hasPayer()) return { ok: false, reason: "PAYER NOT CONFIGURED" };
  if (await isPaused()) return { ok: false, reason: "PIPELINE PAUSED" };
  const b = await budget();
  if (b.remainingActions < 1) return { ok: false, reason: `DAILY BUDGET REACHED (${b.spentImd}/${b.limitImd} IMD)` };
  return { ok: true };
}

async function update(id: string, patch: Partial<OrderRow>): Promise<void> {
  await db().from("imd_orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

/** Quote, sign and submit one paid action. Never throws: the row records the failure. */
export async function paidAction(action: PaidAction, purpose: OrderRow["purpose"], forecastId: string | null, input: unknown): Promise<OrderRow> {
  const gate = await canPay();
  const requestKey = randomUUID();
  const { data: row, error } = await db()
    .from("imd_orders")
    .insert({ request_key: requestKey, action, purpose, forecast_id: forecastId, status: gate.ok ? "quoting" : "failed", error: gate.ok ? null : gate.reason })
    .select("*")
    .single();
  if (error || !row) throw new Error(`order ledger insert failed: ${error?.message ?? "unknown"}`);
  const r = row as OrderRow;
  if (!gate.ok) return r;

  try {
    const q = await quote(action, input, requestKey);
    await update(r.id, { order_id: q.orderId, status: "quoted", amount_wei: q.amount });
    const sub = await payOrder(action, q);
    await update(r.id, { status: "submitted", error: null });
    return { ...r, order_id: q.orderId, status: sub.accepted ? "submitted" : "failed", amount_wei: q.amount };
  } catch (e) {
    let msg = e instanceof PaidRequestError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : "unknown error";
    // surface IMD's own problem codes, e.g. not_answerable, unplannable_steps
    const detail = e instanceof PaidRequestError ? (e.detail as { problems?: { code?: string; detail?: string }[] } | null) : null;
    if (detail?.problems?.length) msg += ` [${detail.problems.map((p) => `${p.code ?? "problem"}: ${p.detail ?? ""}`).join("; ")}]`;
    await update(r.id, { status: "failed", error: msg.slice(0, 900) });
    return { ...r, status: "failed", error: msg };
  }
}

/** Refresh an order from IMD; records job / oracle ids once admitted. */
export async function refreshOrder(r: OrderRow): Promise<OrderRow> {
  if (!r.order_id || ["admitted", "failed", "payment_failed", "expired"].includes(r.status)) return r;
  try {
    const s = await getOrder(r.order_id);
    const patch: Partial<OrderRow> = {
      status: s.status,
      tx_hash: s.txHash,
      job_id: s.jobId ?? r.job_id,
      oracle_request_id: s.oracleRequestId ?? r.oracle_request_id,
    };
    await update(r.id, patch);
    return { ...r, ...patch };
  } catch (e) {
    return { ...r, error: e instanceof Error ? e.message : "refresh failed" };
  }
}

export async function latestOrder(forecastId: string, purpose: OrderRow["purpose"]): Promise<OrderRow | null> {
  const { data } = await db()
    .from("imd_orders")
    .select("*")
    .eq("forecast_id", forecastId)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OrderRow | null) ?? null;
}

export async function ordersFor(forecastId: string, purpose: OrderRow["purpose"]): Promise<OrderRow[]> {
  const { data } = await db().from("imd_orders").select("*").eq("forecast_id", forecastId).eq("purpose", purpose).order("created_at", { ascending: true });
  return (data as OrderRow[] | null) ?? [];
}

export async function recentOrders(limit = 30): Promise<OrderRow[]> {
  const { data } = await db().from("imd_orders").select("*").order("created_at", { ascending: false }).limit(limit);
  return (data as OrderRow[] | null) ?? [];
}
