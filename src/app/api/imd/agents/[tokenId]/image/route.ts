import { getAgentImage } from "@/lib/imd/client";

/** Proxies the agent SVG. Rendered only through <img>, served with a locked CSP. */
export async function GET(_req: Request, ctx: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await ctx.params;
  const img = await getAgentImage(tokenId);
  if (!img.ok || !img.body || /<script|\son\w+\s*=|javascript:/i.test(img.body)) {
    return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(img.body, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
