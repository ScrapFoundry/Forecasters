import s from "./hardware.module.css";

export type LedState = "on" | "off" | "warn" | "err" | "idle";

export function StatusLED({
  state,
  label,
  blink = false,
  hollow = false,
  className,
}: {
  state: LedState;
  label?: string;
  blink?: boolean;
  hollow?: boolean;
  className?: string;
}) {
  const cls = [s.led, state !== "off" ? s[state] : "", blink ? s.blink : "", hollow ? s.hollow : ""].filter(Boolean).join(" ");
  if (!label) return <span className={cls} role="img" aria-label={state} />;
  return (
    <span className={[s.ledWrap, className].filter(Boolean).join(" ")}>
      <span className={cls} aria-hidden />
      <span>{label}</span>
    </span>
  );
}
