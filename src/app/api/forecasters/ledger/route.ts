import { getLedger } from "@/lib/forecasters/forecast";
import { buildBoard } from "@/lib/forecasters/board";

export async function GET() {
  const board = buildBoard(await getLedger());
  return Response.json(board, {
    headers: { "Cache-Control": board.source === "supabase" ? "public, s-maxage=15, stale-while-revalidate=60" : "public, s-maxage=60" },
  });
}
