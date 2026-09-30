import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { verifyMessage, type Hex } from "viem";
import { serverConfig } from "@/lib/config/server";

/**
 * Operator login: sign a one time message with the wallet in OPERATOR_ADDRESS.
 * No private key is involved; the server only verifies the signature and
 * issues an HMAC signed, httpOnly session cookie (12h).
 */

const SESSION = "fc_op";
const NONCE = "fc_nonce";
const TTL = 12 * 3600;

const sign = (payload: string) => createHmac("sha256", serverConfig.sessionSecret).update(payload).digest("hex");

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const operatorConfigured = (): boolean => /^0x[0-9a-f]{40}$/.test(serverConfig.operatorAddress) && serverConfig.sessionSecret.length >= 32;

export function loginMessage(nonce: string, host: string): string {
  return [
    "FORECASTERS OPERATOR LOGIN",
    "",
    "Sign to open an operator session. This costs nothing and grants no token approval.",
    "",
    `Domain: ${host}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export async function issueNonce(): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  const exp = Math.floor(Date.now() / 1000) + 300;
  (await cookies()).set(NONCE, `${nonce}.${exp}.${sign(`${nonce}.${exp}`)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
  return nonce;
}

export async function login(signature: string, host: string): Promise<boolean> {
  if (!operatorConfigured()) return false;
  const jar = await cookies();
  const raw = jar.get(NONCE)?.value ?? "";
  jar.delete(NONCE);
  const [nonce, exp, mac] = raw.split(".");
  if (!nonce || !exp || !mac || !safeEq(mac, sign(`${nonce}.${exp}`)) || Number(exp) < Date.now() / 1000) return false;
  const ok = await verifyMessage({ address: serverConfig.operatorAddress as Hex, message: loginMessage(nonce, host), signature: signature as Hex }).catch(() => false);
  if (!ok) return false;
  const until = Math.floor(Date.now() / 1000) + TTL;
  jar.set(SESSION, `${until}.${sign(`op.${until}`)}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TTL });
  return true;
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION);
}

export async function isOperator(): Promise<boolean> {
  if (!operatorConfigured()) return false;
  const raw = (await cookies()).get(SESSION)?.value ?? "";
  const [until, mac] = raw.split(".");
  if (!until || !mac) return false;
  return safeEq(mac, sign(`op.${until}`)) && Number(until) > Date.now() / 1000;
}
