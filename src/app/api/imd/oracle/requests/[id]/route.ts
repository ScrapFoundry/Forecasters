import { getOracleRequest } from "@/lib/imd/client";
import { respond } from "@/lib/imd/respond";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return respond(await getOracleRequest(id), 60);
}
