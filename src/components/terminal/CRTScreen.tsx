import type { ReactNode } from "react";
import s from "./crt.module.css";

interface Props {
  children: ReactNode;
  /** Gray plastic bezel with brand plate. Off for inline screens. */
  bezel?: boolean;
  flicker?: boolean;
  glitch?: boolean;
  noise?: boolean;
  brand?: string;
  className?: string;
  glassClassName?: string;
  style?: React.CSSProperties;
}

/**
 * Reusable CRT: scanlines, phosphor glow, subtle flicker, curvature vignette,
 * noise and an occasional rolling band. All effects are pointer transparent
 * overlays so the content stays selectable and readable.
 */
export function CRTScreen({
  children,
  bezel = true,
  flicker = true,
  glitch = false,
  noise = true,
  brand = "FORECASTERS",
  className,
  glassClassName,
  style,
}: Props) {
  const glass = (
    <div className={[s.glass, flicker ? s.flicker : "", glitch ? s.glitch : "", glassClassName].filter(Boolean).join(" ")} style={bezel ? undefined : style}>
      {noise ? <div className={s.noise} aria-hidden /> : null}
      <div className={s.band} aria-hidden />
      <div className={s.content}>{children}</div>
    </div>
  );
  if (!bezel) return <div className={[s.bare, className].filter(Boolean).join(" ")}>{glass}</div>;
  return (
    <div className={[s.bezel, className].filter(Boolean).join(" ")} style={style}>
      {glass}
      <span className={s.brand} aria-hidden>{brand}</span>
      <span className={s.powerLed} aria-hidden>
        <i /> PWR
      </span>
    </div>
  );
}

export function Cursor() {
  return <span className={s.cursor} aria-hidden />;
}
