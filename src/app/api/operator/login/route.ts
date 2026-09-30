import { login } from "@/lib/operator/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { signature?: unknown };
  if (typeof body.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(body.signature)) return Response.json({ ok: false }, { status: 400 });
  const ok = await login(body.signature, new URL(req.url).host);
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}
