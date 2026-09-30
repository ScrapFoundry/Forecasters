import type { Job, RawJob, RawJobs } from "./types";
import { isObj, iso, str } from "./util";

/** "skill:oracle-assess" -> "oracle assess", "shape:chain" -> "chain" */
export function jobKind(template: string | null): string {
  if (!template) return "task";
  const tail = template.includes(":") ? template.split(":").slice(1).join(":") : template;
  return tail.replace(/[-_]+/g, " ").trim().toLowerCase() || "task";
}

function deliveryUrl(d: unknown): string | null {
  if (typeof d === "string" && /^https:\/\//.test(d)) return d;
  if (isObj(d)) {
    for (const k of ["url", "repo", "repoUrl", "href"]) {
      const v = d[k];
      if (typeof v === "string" && /^https:\/\//.test(v)) return v;
    }
  }
  return null;
}

export function normalizeJob(raw: RawJob): Job | null {
  const id = str(raw.id);
  if (!id) return null;
  const template = str(raw.template);
  return {
    id,
    state: (str(raw.state) ?? "unknown").toLowerCase(),
    template,
    kind: jobKind(template),
    objective: str(raw.objective),
    blockedReason: str(raw.blockedReason),
    deliveryUrl: deliveryUrl(raw.delivery),
    createdAt: iso(raw.createdAt),
    updatedAt: iso(raw.updatedAt),
  };
}

export function normalizeJobs(raw: RawJobs): Job[] {
  const list = Array.isArray(raw.jobs) ? raw.jobs : Array.isArray(raw) ? (raw as RawJob[]) : [];
  return list.map(normalizeJob).filter((j): j is Job => j !== null);
}

export function jobStateCounts(jobs: Job[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const j of jobs) out[j.state] = (out[j.state] ?? 0) + 1;
  return out;
}

/** Jobs created in the trailing window, bucketed for small charts. */
export function jobsHistogram(jobs: Job[], buckets = 24, windowMs = 24 * 3600_000, now = Date.now()): number[] {
  const out = new Array<number>(buckets).fill(0);
  const size = windowMs / buckets;
  for (const j of jobs) {
    if (!j.createdAt) continue;
    const age = now - Date.parse(j.createdAt);
    if (age < 0 || age >= windowMs) continue;
    const idx = buckets - 1 - Math.floor(age / size);
    out[idx] = (out[idx] ?? 0) + 1;
  }
  return out;
}
