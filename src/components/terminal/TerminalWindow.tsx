import type { ReactNode } from "react";
import s from "./crt.module.css";
import { CRTScreen } from "./CRTScreen";

interface Props {
  title: string;
  status?: ReactNode;
  children: ReactNode;
  bezel?: boolean;
  className?: string;
  bodyClassName?: string;
  glitch?: boolean;
  minHeight?: number | string;
}

export function TerminalWindow({ title, status, children, bezel = true, className, bodyClassName, glitch, minHeight }: Props) {
  return (
    <CRTScreen bezel={bezel} className={className} glitch={glitch}>
      <div className={s.term} style={{ minHeight }}>
        <div className={s.termBar}>
          <span className={s.termTitle}>{title}</span>
          {status ? <span className={s.termStatus}>{status}</span> : null}
        </div>
        <div className={[s.termBody, bodyClassName].filter(Boolean).join(" ")}>{children}</div>
      </div>
    </CRTScreen>
  );
}
