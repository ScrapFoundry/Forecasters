import { logout } from "@/lib/operator/session";

export async function POST() {
  await logout();
  return Response.json({ ok: true });
}
