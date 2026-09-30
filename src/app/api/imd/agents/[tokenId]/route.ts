import { getAgent } from "@/lib/imd/client";
import { respond } from "@/lib/imd/respond";

export async function GET(_req: Request, ctx: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await ctx.params;
  return respond(await getAgent(tokenId), 15);
}
