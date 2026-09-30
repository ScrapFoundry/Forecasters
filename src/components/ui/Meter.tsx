import s from "./hardware.module.css";

/** Block character meter: ██████████░░░░. `tone` picks phosphor, ink or muted. */
export function Meter({
  value,
  width = 20,
  tone = "ph",
  className,
}: {
  value: number | null;
  width?: number;
  tone?: "ph" | "ink" | "muted";
  className?: string;
}) {
  const v = value === null || !Number.isFinite(value) ? 0 : Math.max(0, Math.min(1, value));
  const n = Math.round(v * width);
  const toneCls = tone === "ink" ? s.inkMeter : tone === "muted" ? s.muted : "";
  return (
    <span className={[s.meter, toneCls, className].filter(Boolean).join(" ")} aria-hidden>
      <span className={s.meterFill}>{"█".repeat(n)}</span>
      <span className={s.meterRest}>{"░".repeat(width - n)}</span>
    </span>
  );
}
