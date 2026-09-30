import { sha256, stringToBytes } from "viem";

/**
 * IMD canonical JSON + hash, matching the Explorer client (explorer.imd.fun):
 *   keys sorted, integers only, no undefined, no class instances
 *   hash = sha256(utf8(canonical(value))) as hex WITHOUT 0x
 */
export class CanonicalError extends Error {}

export function canonical(value: unknown): string {
  const walk = (v: unknown, path: string[]): string => {
    if (v === null) return "null";
    switch (typeof v) {
      case "boolean":
        return v ? "true" : "false";
      case "number":
        if (!Number.isFinite(v)) throw new CanonicalError(`non-finite number at $.${path.join(".")}`);
        if (!Number.isInteger(v)) throw new CanonicalError(`non-integer number at $.${path.join(".")}`);
        return JSON.stringify(v === 0 ? 0 : v);
      case "string":
        return JSON.stringify(v);
      case "object": {
        if (Array.isArray(v)) return `[${v.map((x, i) => walk(x, [...path, String(i)])).join(",")}]`;
        const proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null) throw new CanonicalError(`unsupported object at $.${path.join(".")}`);
        const o = v as Record<string, unknown>;
        return `{${Object.keys(o)
          .sort()
          .map((k) => {
            if (o[k] === undefined) throw new CanonicalError(`undefined at key "${k}"`);
            return `${JSON.stringify(k)}:${walk(o[k], [...path, k])}`;
          })
          .join(",")}}`;
      }
      default:
        throw new CanonicalError(`unsupported type "${typeof v}"`);
    }
  };
  return walk(value, []);
}

export const canonicalHash = (value: unknown): string => sha256(stringToBytes(canonical(value))).slice(2);

/** requesterScopeHash IMD derives from the bearer token. */
export function requesterScopeHash(token: string): string {
  const scope = `paid-client:${canonicalHash({ domain: "identitymd.paid-http-client", token })}`;
  return canonicalHash({ domain: "identitymd.paid-requester", scope });
}
