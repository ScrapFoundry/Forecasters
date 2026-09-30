import { tokenConfig } from "@/lib/config/token";

export const dynamic = "force-dynamic";

/** Runtime token / CA config for the client (no rebuild needed when the CA changes). */
export async function GET() {
  return Response.json(tokenConfig(), { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } });
}
