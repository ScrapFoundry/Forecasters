import "server-only";
import { randomUUID } from "node:crypto";
import { serverConfig } from "@/lib/config/server";
import { challenge, checkRequirements, getCapabilities, operatorAccount, PaidRequestError, quote, quoteApprovalTypedData } from "@/lib/imd/paid";
import { forecastJobInput, resolutionInput, type PipelineForecast } from "./imdjobs";

/**
 * PROBE (free): validates both request bodies with IMD's quote endpoint and
 * reads one 402 challenge, running every check the IMD Explorer runs, WITHOUT
 * signing or paying anything.
 */
export async function probe() {
  const now = Date.now();
  const sample: PipelineForecast = {
    id: "probe",
    number: 0,
    question: "Will ETH close above $3,000 on the next UTC daily candle?",
    resolution_criteria: "ETH/USD daily close on a major exchange is above 3000 USD",
    oracle_question: "Did ETH/USD close above 3000 USD on the most recent UTC daily candle?",
    deadline: new Date(now + 48 * 3_600_000).toISOString(),
    created_at: new Date(now).toISOString(),
  };
  const out: Record<string, unknown> = { at: new Date().toISOString(), payer: operatorAccount().address };
  const err = (e: unknown) => (e instanceof PaidRequestError ? { code: e.code, message: e.message, detail: e.detail } : { message: String(e) });

  try {
    out.capabilities = (await getCapabilities()).map((c) => ({ action: c.action, amount: c.payment.amount, payTo: c.payment.payTo, asset: c.payment.asset }));
  } catch (e) {
    out.capabilities = err(e);
  }

  let first: Awaited<ReturnType<typeof quote>> | null = null;
  for (const shape of ["chain", "single", "panel"] as const) {
    try {
      const q = await quote("job.open", forecastJobInput(sample, serverConfig.forecastPanel, shape), randomUUID());
      out[`forecastJob_${shape}`] = { accepted: true, orderId: q.orderId, amount: q.amount, expiresAt: q.expiresAt };
      first ??= q;
    } catch (e) {
      out[`forecastJob_${shape}`] = { accepted: false, ...err(e) };
    }
  }
  try {
    const q = await quote("oracle.request", resolutionInput(sample, serverConfig.oraclePanel, serverConfig.oracleQuorum), randomUUID());
    out.oracleRequest = { accepted: true, orderId: q.orderId, amount: q.amount };
  } catch (e) {
    out.oracleRequest = { accepted: false, ...err(e) };
  }

  let ok = false;
  if (first) {
    try {
      const ch = await challenge(first.orderId);
      const problem = await checkRequirements("job.open", ch, first);
      const typed = quoteApprovalTypedData(ch, { probe: true });
      out.challenge = {
        accepts: ch.accepts,
        quote: ch.quote,
        resourceUrl: ch.resourceUrl,
        checks: problem ?? "ALL CHECKS PASSED",
        quoteApprovalDomain: typed.domain,
      };
      ok = problem === null;
    } catch (e) {
      out.challenge = err(e);
    }
  }
  out.readyToPay = ok;
  return out;
}
