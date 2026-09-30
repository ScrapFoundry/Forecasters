import { issueNonce, loginMessage, operatorConfigured } from "@/lib/operator/session";

export async function GET(req: Request) {
  if (!operatorConfigured()) return Response.json({ error: "OPERATOR_ADDRESS / OPERATOR_SESSION_SECRET not configured" }, { status: 503 });
  const nonce = await issueNonce();
  const host = new URL(req.url).host;
  return Response.json({ message: loginMessage(nonce, host) }, { headers: { "Cache-Control": "no-store" } });
}
