import type { ReactNode } from "react";
import s from "./hardware.module.css";

interface Props {
  label: string;
  code?: string;
  tone?: "hw" | "grey" | "dark";
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
  as?: "section" | "div" | "article";
}

/** Physical instrument casing: screws, printed label plate, content bay. */
export function InstrumentPanel({ label, code, tone = "hw", footer, className, children, as: Tag = "section" }: Props) {
  const toneClass = tone === "dark" ? s.dark : tone === "grey" ? s.grey : "";
  return (
    <Tag className={[s.panel, toneClass, className].filter(Boolean).join(" ")} aria-label={label}>
      <header className={s.plate}>
        <span className={s.plateLabel}>{label}</span>
        {code ? <span className={s.plateCode}>{code}</span> : null}
      </header>
      <div className={s.body}>{children}</div>
      {footer ? <footer className={s.footer}>{footer}</footer> : null}
    </Tag>
  );
}

export function Screen({
  children,
  className,
  tone = "green",
  style,
}: {
  children: ReactNode;
  className?: string;
  tone?: "green" | "amber" | "white";
  style?: React.CSSProperties;
}) {
  const t = tone === "amber" ? s.amber : tone === "white" ? s.white : "";
  return (
    <div className={[s.screen, t, className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}

/** Alias kept for the design system vocabulary. */
export const ControlPanel = InstrumentPanel;
