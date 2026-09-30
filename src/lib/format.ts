/** Formatting helpers. `null` always renders as UNKNOWN, never as 0. */

export const UNKNOWN = "UNKNOWN";

export function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNKNOWN;
  return Math.round(v).toLocaleString("en-US");
}

export function fmtCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNKNOWN;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e3).toFixed(1)}K`;
  return fmtInt(v);
}

export function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNKNOWN;
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtSigned(v: number): string {
  return v > 0 ? `+${v}` : String(v);
}

export function fmtAgo(iso: string | number | null | undefined, now = Date.now()): string {
  if (iso === null || iso === undefined) return UNKNOWN;
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return UNKNOWN;
  const s = Math.max(0, (now - t) / 1000);
  if (s < 10) return `${s.toFixed(1)}s AGO`;
  if (s < 60) return `${Math.floor(s)}s AGO`;
  if (s < 3600) return `${Math.floor(s / 60)}m AGO`;
  if (s < 86400) return `${Math.floor(s / 3600)}h AGO`;
  return `${Math.floor(s / 86400)}d AGO`;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local wall clock HH:MM or HH:MM:SS. Computed on the client to avoid hydration drift. */
export function fmtClock(iso: string | number | null | undefined, seconds = false): string {
  if (iso === null || iso === undefined) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return seconds ? `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return UNKNOWN;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return UNKNOWN;
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export function shortAddr(a: string | null | undefined): string {
  if (!a) return UNKNOWN;
  return a.length > 12 ? `${a.slice(0, 6)}..${a.slice(-4)}` : a;
}

/** ASCII meter: ██████░░░░ */
export function asciiBar(v: number | null | undefined, width = 20): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "░".repeat(width);
  const n = Math.round(Math.max(0, Math.min(1, v)) * width);
  return "█".repeat(n) + "░".repeat(width - n);
}
