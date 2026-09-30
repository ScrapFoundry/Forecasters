import type { ReactNode } from "react";
import Link from "next/link";
import s from "./page.module.css";

export function PageHeader({ crumb, title, sub, aside }: { crumb: { href?: string; label: string }[]; title: ReactNode; sub?: string; aside?: ReactNode }) {
  return (
    <header className={s.head}>
      <div>
        <div className={s.crumb}>
          <Link href="/">◇ FORECASTERS</Link>
          {crumb.map((c) => (
            <span key={c.label}>
              / {c.href ? <Link href={c.href}>{c.label}</Link> : c.label}
            </span>
          ))}
        </div>
        <h1 className={s.title}>{title}</h1>
        {sub ? <p className={s.sub}>{sub}</p> : null}
      </div>
      {aside ? <div className={s.headAside}>{aside}</div> : null}
    </header>
  );
}
