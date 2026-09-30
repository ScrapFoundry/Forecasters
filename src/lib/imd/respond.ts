import "server-only";
import type { ImdResult } from "./types";

/**
 * Uniform JSON envelope for proxy routes. A failed upstream read returns 200
 * with ok:false so the client can mark the feed DEGRADED without treating it
 * as a transport error. Short CDN caching keeps polling cheap for IMD.
 */
export function respond<T>(r: ImdResult<T>, sMaxAge: number): Response {
  return Response.json(r, {
    status: 200,
    headers: {
      "Cache-Control": r.ok
        ? `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 3}`
        : "no-store",
    },
  });
}
