import s from "./hardware.module.css";
import { fmtInt, UNKNOWN } from "@/lib/format";

interface Props {
  label?: string;
  value: number | string | null | undefined;
  size?: "sm" | "md" | "lg";
  sub?: string;
  warn?: boolean;
  format?: (v: number) => string;
  className?: string;
}

/** Numeric readout in a phosphor window. null renders UNKNOWN, never 0. */
export function DigitalCounter({ label, value, size = "md", sub, warn, format = fmtInt, className }: Props) {
  const isNum = typeof value === "number" && Number.isFinite(value);
  const text = isNum ? format(value) : typeof value === "string" ? value : UNKNOWN;
  const unknown = !isNum && typeof value !== "string";
  return (
    <div className={[s.counter, s[size], className].filter(Boolean).join(" ")}>
      {label ? <span className={s.counterLabel}>{label}</span> : null}
      <div className={s.counterWindow}>
        <span className={s.counterGhost} aria-hidden>
          {"8".repeat(Math.max(3, text.length))}
        </span>
        <span className={[s.counterValue, unknown ? s.unknown : "", warn ? s.warn : ""].filter(Boolean).join(" ")}>{text}</span>
      </div>
      {sub ? <span className={s.counterSub}>{sub}</span> : null}
    </div>
  );
}
