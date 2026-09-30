import s from "./hardware.module.css";

/** Rotary control. Display only unless wrapped by an interactive parent. */
export function Knob({ value, label }: { value: number; label?: string }) {
  const deg = -135 + Math.max(0, Math.min(1, value)) * 270;
  return (
    <span className={s.knob}>
      <span className={s.knobCap} style={{ transform: `rotate(${deg}deg)` }} aria-hidden />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
