import "server-only";
import { randomUUID } from "node:crypto";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { x402Client } from "@x402/core/client";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { createPermit2ApprovalTx, getPermit2AllowanceReadParams } from "@x402/evm";
import { hasPayer, serverConfig } from "@/lib/config/server";
import { canonical, canonicalHash, requesterScopeHash } from "./canonical";

/**
 * IMD PAID REQUESTS
 *
 * Implements the documented flow at imd.fun/docs#paid:
 *
 *   1. POST /requests/quote            Bearer token, { requestKey, action, input }
 *   2. POST /requests/:id/submit       no body  -> 402 + PAYMENT-REQUIRED (x402 v2)
 *   3. verify the challenge exactly like the IMD Explorer does, then sign
 *      the Permit2 payment (x402 exact) and the EIP-712 QuoteApproval
 *      (domain "IdentityMD Paid Action", read from explorer.imd.fun's client)
 *   4. POST /requests/:id/submit       payment-signature header (base64 JSON) + { quoteSignature } -> 202
 *   5. GET  /requests/:id              until status === "admitted"
 *
 * Price is 0.5 IMD per action. The IMD server pays gas; the operator wallet only
 * needs IMD and a one time Permit2 approval.
 *
 * Safety: nothing is signed unless payments are enabled, the payer is
 * configured, and IMD asks for exactly the expected token, network, amount
 * ceiling and payee published in /requests/capabilities.
 */

export type PaidAction = "job.open" | "oracle.request";

export class PaidRequestError extends Error {
  constructor(
    public code:
      | "DISABLED"
      | "NOT_CONFIGURED"
      | "QUOTE_FAILED"
      | "CHALLENGE_FAILED"
      | "UNSAFE_REQUIREMENTS"
      | "QUOTE_APPROVAL_FORMAT_UNKNOWN"
      | "SUBMIT_FAILED"
      | "HTTP",
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const api = (path: string) => `${serverConfig.imdApiUrl}${path}`;

function bearer(): Record<string, string> {
  return { Authorization: `Bearer ${serverConfig.imdBearerToken}` };
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text.slice(0, 2000) };
  }
}

let accountCache: PrivateKeyAccount | null = null;
export function operatorAccount(): PrivateKeyAccount {
  if (!hasPayer()) throw new PaidRequestError("NOT_CONFIGURED", "OPERATOR_PRIVATE_KEY and IMD_BEARER_TOKEN (64 hex) are required");
  const key = serverConfig.operatorPrivateKey.startsWith("0x") ? serverConfig.operatorPrivateKey : `0x${serverConfig.operatorPrivateKey}`;
  accountCache ??= privateKeyToAccount(key as Hex);
  return accountCache;
}

/* ------------------------------------------------------------------ */
/* Capabilities                                                        */
/* ------------------------------------------------------------------ */

export interface ActionCapability {
  action: string;
  version: string;
  payment: { network: string; asset: string; amount: string; payTo: string; decimals: number };
  quoteTtlSeconds: number;
}

let capsCache: { at: number; value: ActionCapability[] } | null = null;

export async function getCapabilities(): Promise<ActionCapability[]> {
  if (capsCache && Date.now() - capsCache.at < 10 * 60_000) return capsCache.value;
  const res = await fetch(api("/requests/capabilities"), { cache: "no-store" });
  if (!res.ok) throw new PaidRequestError("HTTP", `capabilities ${res.status}`);
  const body = (await res.json()) as { actions?: ActionCapability[] };
  const value = Array.isArray(body.actions) ? body.actions : [];
  capsCache = { at: Date.now(), value };
  return value;
}

/* ------------------------------------------------------------------ */
/* Quote + challenge (free)                                            */
/* ------------------------------------------------------------------ */

/** Quote object as IMD returns it (order.quote). Kept verbatim: it is re-hashed and compared. */
export interface ImdQuote {
  id: string;
  action: string;
  expiresAt: number;
  inputHash?: string;
  quoteHash?: string;
  payer?: string | null;
  payment: { network: string; asset: string; amount: string; payTo: string; decimals?: number };
  [k: string]: unknown;
}

export interface QuotedOrder {
  orderId: string;
  status: string;
  quote: ImdQuote;
  input: unknown;
  amount: string | null;
  expiresAt: number | null;
  raw: unknown;
}

export async function quote(action: PaidAction, input: unknown, requestKey: string = randomUUID()): Promise<QuotedOrder> {
  if (!/^[0-9a-f]{64}$/i.test(serverConfig.imdBearerToken)) {
    throw new PaidRequestError("NOT_CONFIGURED", "IMD_BEARER_TOKEN must be 32 bytes as 64 hex characters");
  }
  const res = await fetch(api("/requests/quote"), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: JSON.stringify({ requestKey, action, input }),
    cache: "no-store",
  });
  const body = (await readJson(res)) as { order?: { id?: string; status?: string; quote?: ImdQuote; inputJson?: string } } | null;
  if (!res.ok || !body?.order?.id || !body.order.quote) {
    throw new PaidRequestError("QUOTE_FAILED", `quote rejected (${res.status})`, body);
  }
  const q = body.order.quote;
  // IMD normalizes the input (adds defaults). Its saved copy is what gets hashed and run,
  // so we keep it, after checking it still contains exactly the work we asked for.
  let saved: unknown = input;
  if (typeof body.order.inputJson === "string") {
    try {
      saved = JSON.parse(body.order.inputJson);
    } catch {
      throw new PaidRequestError("QUOTE_FAILED", "IMD returned an unreadable inputJson");
    }
  }
  // oracle.request is saved as { pinned, questionHash, request: <our body> }
  const savedWork = action === "oracle.request" && isObj(saved) && isObj(saved.request) ? saved.request : saved;
  if (!containsWork(input, savedWork)) {
    throw new PaidRequestError("QUOTE_FAILED", "IMD saved different work from what was requested. Nothing was charged.", { sent: input, saved });
  }
  return {
    orderId: body.order.id,
    status: body.order.status ?? "quoted",
    quote: q,
    input: saved,
    amount: q.payment?.amount ?? (typeof q.amount === "string" ? q.amount : null),
    expiresAt: typeof q.expiresAt === "number" ? q.expiresAt : null,
    raw: body,
  };
}

/** True when every value we sent is present, unchanged, in what IMD saved (IMD may only add defaults). */
export function containsWork(sent: unknown, saved: unknown): boolean {
  if (sent === undefined) return true;
  if (sent === null || typeof sent !== "object") return canonical(sent) === canonical(saved ?? null);
  if (Array.isArray(sent)) return Array.isArray(saved) && saved.length === sent.length && sent.every((x, i) => containsWork(x, saved[i]));
  if (!isObj(saved)) return false;
  return Object.entries(sent as Record<string, unknown>).every(([k, v]) => containsWork(v, saved[k]));
}

/** 402 challenge body (JSON). Mirrors x402 PaymentRequired plus IMD's quote binding. */
export interface Challenge {
  x402Version: number;
  resource: PaymentRequired["resource"];
  accepts: PaymentRequirements[];
  quote: ImdQuote;
  requesterScopeHash: string;
  resourceUrl: string;
  input: unknown;
  [k: string]: unknown;
}

export async function challenge(orderId: string): Promise<Challenge> {
  const res = await fetch(api(`/requests/${encodeURIComponent(orderId)}/submit`), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  const body = (await readJson(res)) as Challenge | null;
  if (res.status !== 402 || !body || !Array.isArray(body.accepts)) {
    throw new PaidRequestError("CHALLENGE_FAILED", `expected 402 with a payment challenge, got ${res.status}`, body);
  }
  return body;
}

/* ------------------------------------------------------------------ */
/* Safety: the same checks the IMD Explorer runs before signing        */
/* ------------------------------------------------------------------ */

export async function verifyChallenge(action: PaidAction, ch: Challenge, quoted: Pick<QuotedOrder, "orderId" | "quote" | "input">): Promise<PaymentRequirements> {
  const fail = (what: string, detail?: unknown): never => {
    throw new PaidRequestError("UNSAFE_REQUIREMENTS", `payment details changed or unexpected (${what}). Nothing was signed.`, detail);
  };
  const { quoteHash, ...quoteRest } = ch.quote;
  const expectedResource = `${serverConfig.imdApiUrl}/requests/${quoted.quote.id}`;
  const d = ch.accepts[0];

  if (canonical(ch.quote) !== canonical(quoted.quote)) fail("quote");
  if (quoteHash !== canonicalHash({ domain: "identitymd.paid-action-quote", ...quoteRest })) fail("quote hash");
  if (canonicalHash(ch.input) !== quoted.quote.inputHash || canonical(ch.input) !== canonical(quoted.input)) fail("work");
  if (ch.resourceUrl !== expectedResource || ch.resource?.url !== expectedResource) fail("resource", { got: ch.resourceUrl, expected: expectedResource });
  if (ch.requesterScopeHash !== requesterScopeHash(serverConfig.imdBearerToken)) fail("credential");
  if (ch.x402Version !== 2 || ch.accepts.length !== 1 || !d) fail("version");
  const req = d as PaymentRequirements;
  const pay = quoted.quote.payment;
  if (req.scheme !== "exact" || req.network !== pay.network || req.network !== "eip155:1") fail("network");
  if (req.asset.toLowerCase() !== pay.asset.toLowerCase() || req.payTo.toLowerCase() !== pay.payTo.toLowerCase() || req.amount !== pay.amount) fail("amount");
  if (canonical(req.extra ?? null) !== canonical({ assetTransferMethod: "permit2" })) fail("transfer method");
  if (!Number.isInteger(req.maxTimeoutSeconds) || req.maxTimeoutSeconds < 6 || req.maxTimeoutSeconds > 300) fail("deadline");

  // our own policy on top: IMD token, published payee, price ceiling
  const cap = (await getCapabilities()).find((c) => c.action === action);
  if (!cap) fail(`action ${action} not offered`);
  if (
    req.asset.toLowerCase() !== serverConfig.imdToken ||
    req.payTo.toLowerCase() !== cap!.payment.payTo.toLowerCase() ||
    cap!.payment.amount !== req.amount ||
    BigInt(req.amount) > BigInt(serverConfig.maxPricePerAction)
  ) {
    fail("advertised price / token / payee");
  }
  return req;
}

/** Kept for the probe: returns null when fine, else the reason. */
export async function checkRequirements(action: PaidAction, ch: Challenge, quoted: QuotedOrder): Promise<string | null> {
  try {
    await verifyChallenge(action, ch, quoted);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "unknown";
  }
}

/* ------------------------------------------------------------------ */
/* Pay: Permit2 payment + EIP-712 QuoteApproval                        */
/* ------------------------------------------------------------------ */

/** EIP-712 QuoteApproval exactly as the IMD Explorer builds it. */
export function quoteApprovalTypedData(ch: Challenge, payment: unknown) {
  const q = ch.quote;
  return {
    domain: { name: "IdentityMD Paid Action", version: "1", chainId: Number(q.payment.network.slice(7)) },
    primaryType: "QuoteApproval" as const,
    types: {
      QuoteApproval: [
        { name: "resource", type: "string" },
        { name: "requesterScopeHash", type: "bytes32" },
        { name: "quoteId", type: "string" },
        { name: "quoteHash", type: "bytes32" },
        { name: "paymentHash", type: "bytes32" },
        { name: "action", type: "string" },
        { name: "asset", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "payTo", type: "address" },
        { name: "expiresAt", type: "uint256" },
      ],
    },
    message: {
      resource: ch.resourceUrl,
      requesterScopeHash: `0x${ch.requesterScopeHash}` as Hex,
      quoteId: q.id,
      quoteHash: `0x${q.quoteHash}` as Hex,
      paymentHash: `0x${canonicalHash(payment)}` as Hex,
      action: q.action,
      asset: q.payment.asset as Hex,
      amount: BigInt(q.payment.amount),
      payTo: q.payment.payTo as Hex,
      expiresAt: BigInt(q.expiresAt),
    },
  };
}

function paymentClient(account: PrivateKeyAccount, req: PaymentRequirements): x402Client {
  const client = new x402Client();
  registerExactEvmScheme(client, {
    signer: account,
    networks: [req.network],
    ...(serverConfig.ethRpcUrl ? { schemeOptions: { rpcUrl: serverConfig.ethRpcUrl } } : {}),
  });
  client.setSpendControls({ allowedAssets: [{ network: req.network, asset: req.asset, maxAmountPerPayment: req.amount }] });
  return client;
}

const toBase64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

export interface SubmitResult {
  orderId: string;
  accepted: boolean;
  status: number;
  body: unknown;
}

/** Signs (2 signatures) and submits payment for a quoted order. */
export async function payOrder(action: PaidAction, quoted: QuotedOrder): Promise<SubmitResult> {
  if (!serverConfig.paymentsEnabled) throw new PaidRequestError("DISABLED", "IMD_PAYMENTS_ENABLED is not true");
  const account = operatorAccount();
  const ch = await challenge(quoted.orderId);
  if (ch.quote.payer && ch.quote.payer.toLowerCase() !== account.address.toLowerCase()) {
    throw new PaidRequestError("UNSAFE_REQUIREMENTS", "quote is bound to another payer wallet. Nothing was signed.");
  }
  const req = await verifyChallenge(action, ch, quoted);

  const now = () => Math.floor(Date.now() / 1000);
  const left = ch.quote.expiresAt - now() - 2;
  if (left < 15) throw new PaidRequestError("UNSAFE_REQUIREMENTS", "quote too close to expiry. Nothing was signed.");
  const offered: PaymentRequirements = { ...req, maxTimeoutSeconds: Math.min(req.maxTimeoutSeconds, left) };

  // Signature 1 of 2: Permit2 payment (x402 exact). `accepted` is reset to the requirement IMD sent.
  const created = await paymentClient(account, req).createPaymentPayload({ x402Version: 2, resource: ch.resource, accepts: [offered] });
  const payment = JSON.parse(JSON.stringify({ ...created, accepted: req })) as PaymentPayload;

  // Signature 2 of 2: EIP-712 QuoteApproval binding quote, requester and this exact payment.
  const quoteSignature = await account.signTypedData(quoteApprovalTypedData(ch, payment));
  if (ch.quote.expiresAt - now() < 8) throw new PaidRequestError("UNSAFE_REQUIREMENTS", "quote expired while signing. Nothing was submitted.");

  const res = await fetch(api(`/requests/${encodeURIComponent(quoted.orderId)}/submit`), {
    method: "POST",
    headers: { ...bearer(), "Content-Type": "application/json", "payment-signature": toBase64(JSON.stringify(payment)) },
    body: JSON.stringify({ quoteSignature }),
    cache: "no-store",
  });
  const body = await readJson(res);
  if (res.status !== 200 && res.status !== 202) {
    throw new PaidRequestError("SUBMIT_FAILED", `submit rejected (${res.status})`, body);
  }
  return { orderId: quoted.orderId, accepted: true, status: res.status, body };
}

/* ------------------------------------------------------------------ */
/* Order status + results                                              */
/* ------------------------------------------------------------------ */

export interface OrderStatus {
  status: string;
  paid: boolean;
  txHash: string | null;
  jobId: string | null;
  oracleRequestId: string | null;
  raw: unknown;
}

export async function getOrder(orderId: string): Promise<OrderStatus> {
  const res = await fetch(api(`/requests/${encodeURIComponent(orderId)}`), { headers: bearer(), cache: "no-store" });
  const body = (await readJson(res)) as {
    status?: string;
    payment?: { paid?: boolean; transactionHash?: string };
    admission?: { result?: { jobId?: string; requestId?: string } };
  } | null;
  if (!res.ok || !body) throw new PaidRequestError("HTTP", `order ${res.status}`, body);
  return {
    status: body.status ?? "unknown",
    paid: Boolean(body.payment?.paid),
    txHash: body.payment?.transactionHash ?? null,
    jobId: body.admission?.result?.jobId ?? null,
    oracleRequestId: body.admission?.result?.requestId ?? null,
    raw: body,
  };
}

export interface JobNode {
  key: string;
  state: string;
  seat: { tokenId: string; agentId: string | null } | null;
  updatedAt: string | null;
}

export interface JobDetail {
  id: string;
  state: string;
  nodes: JobNode[];
  raw: unknown;
}

export async function getJobDetail(jobId: string): Promise<JobDetail> {
  const res = await fetch(api(`/jobs/${encodeURIComponent(jobId)}`), { cache: "no-store" });
  const body = (await readJson(res)) as { id?: string; state?: string; nodes?: unknown[] } | null;
  if (!res.ok || !body) throw new PaidRequestError("HTTP", `job ${res.status}`, body);
  const nodes: JobNode[] = (Array.isArray(body.nodes) ? body.nodes : []).filter(isObj).map((n) => {
    const seat = isObj(n.seat) && n.seat.tokenId !== undefined ? { tokenId: String(n.seat.tokenId), agentId: n.seat.agentId ? String(n.seat.agentId) : null } : null;
    return { key: String(n.key ?? ""), state: String(n.state ?? ""), seat, updatedAt: typeof n.updatedAt === "string" ? n.updatedAt : null };
  });
  return { id: body.id ?? jobId, state: (body.state ?? "unknown").toLowerCase(), nodes, raw: body };
}

export interface JobFile {
  name: string;
  path: string;
  url: string;
  mediaType: string | null;
}

export async function getJobFiles(jobId: string): Promise<{ complete: boolean; state: string; files: JobFile[] }> {
  const res = await fetch(api(`/jobs/${encodeURIComponent(jobId)}/result`), { cache: "no-store" });
  const body = (await readJson(res)) as { complete?: boolean; state?: string; files?: unknown[] } | null;
  if (!res.ok || !body) throw new PaidRequestError("HTTP", `job result ${res.status}`, body);
  const files = (Array.isArray(body.files) ? body.files : []).filter(isObj).map((f) => ({
    name: String(f.name ?? ""),
    path: String(f.path ?? ""),
    url: String(f.url ?? ""),
    mediaType: typeof f.mediaType === "string" ? f.mediaType : null,
  }));
  return { complete: Boolean(body.complete), state: String(body.state ?? ""), files };
}

export async function readArtifact(url: string): Promise<string> {
  const full = url.startsWith("http") ? url : api(url);
  if (!full.startsWith(serverConfig.imdApiUrl)) throw new PaidRequestError("HTTP", "artifact outside IMD API refused");
  const res = await fetch(full, { cache: "no-store" });
  if (!res.ok) throw new PaidRequestError("HTTP", `artifact ${res.status}`);
  return (await res.text()).slice(0, 200_000);
}

/* ------------------------------------------------------------------ */
/* Operator wallet status + Permit2                                    */
/* ------------------------------------------------------------------ */

function publicClient() {
  return createPublicClient({ chain: mainnet, transport: http(serverConfig.ethRpcUrl || undefined) });
}

export interface WalletStatus {
  address: string;
  eth: string | null;
  imd: string | null;
  permit2Allowance: string | null;
  needsApproval: boolean | null;
}

export async function walletStatus(): Promise<WalletStatus> {
  const account = operatorAccount();
  const pc = publicClient();
  const token = serverConfig.imdToken as Hex;
  const [eth, imd, allowance] = await Promise.allSettled([
    pc.getBalance({ address: account.address }),
    pc.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
    pc.readContract(getPermit2AllowanceReadParams({ tokenAddress: token, ownerAddress: account.address })),
  ]);
  const al = allowance.status === "fulfilled" ? (allowance.value as bigint) : null;
  return {
    address: account.address,
    eth: eth.status === "fulfilled" ? formatUnits(eth.value, 18) : null,
    imd: imd.status === "fulfilled" ? formatUnits(imd.value as bigint, 18) : null,
    permit2Allowance: al === null ? null : formatUnits(al, 18),
    needsApproval: al === null ? null : al < BigInt(serverConfig.maxPricePerAction) * 20n,
  };
}

/** One time max approval of IMD to the canonical Permit2 contract. Costs gas (ETH). */
export async function approvePermit2(): Promise<Hex> {
  if (!serverConfig.paymentsEnabled) throw new PaidRequestError("DISABLED", "IMD_PAYMENTS_ENABLED is not true");
  const account = operatorAccount();
  const tx = createPermit2ApprovalTx(serverConfig.imdToken as Hex);
  const wc = createWalletClient({ account, chain: mainnet, transport: http(serverConfig.ethRpcUrl || undefined) });
  return wc.sendTransaction({ to: tx.to, data: tx.data });
}
