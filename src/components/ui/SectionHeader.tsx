import type { ReactNode } from "react";
import s from "./hardware.module.css";

export function SectionHeader({ idx, title, sub, aside, id }: { idx?: string; title: string; sub?: string; aside?: ReactNode; id?: string }) {
  return (
    <header className={s.section} id={id}>
      <div>
        {idx ? <div className={s.sectionIdx}>{idx}</div> : null}
        <h2 className={s.sectionTitle}>{title}</h2>
        {sub ? <p className={s.sectionSub}>{sub}</p> : null}
      </div>
      {aside ? <div className={s.sectionAside}>{aside}</div> : null}
    </header>
  );
}

export function Notice({ title, children, tone }: { title: string; children?: ReactNode; tone?: "warn" | "err" }) {
  return (
    <div className={[s.notice, tone ? s[tone] : ""].filter(Boolean).join(" ")} role={tone === "err" ? "alert" : "status"}>
      <span className={s.noticeTitle}>{title}</span>
      {children ? <span>{children}</span> : null}
    </div>
  );
}
