import Link from "next/link";
import { publicConfig } from "@/lib/config/public";
import { LogoMark } from "./Logo";
import { TokenCA } from "./TokenCA";
import s from "./shell.module.css";

export function Footer() {
  const links = [
    { label: "IMD", href: publicConfig.imdUrl, ext: true },
    { label: "DOCS", href: "/docs", ext: false },
    { label: "EXPLORER", href: publicConfig.explorerUrl, ext: true },
    ...(publicConfig.githubUrl ? [{ label: "GITHUB", href: publicConfig.githubUrl, ext: true }] : []),
    ...(publicConfig.xUrl ? [{ label: "X", href: publicConfig.xUrl, ext: true }] : []),
  ];
  return (
    <footer className={s.footer}>
      <div className={s.footerInner}>
        <div className={s.footerBrand}>
          <LogoMark size={28} />
          <span>FORECASTERS</span>
          <span className={s.footerMuted}>AN INTELLIGENCE LAYER ON TOP OF IMD. NOT AFFILIATED WITH IMD.</span>
        </div>
        <TokenCA />
        <nav className={s.footerLinks} aria-label="footer">
          {links.map((l) =>
            l.ext ? (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">
                {l.label}
              </a>
            ) : (
              <Link key={l.label} href={l.href}>
                {l.label}
              </Link>
            ),
          )}
        </nav>
        <p className={s.footerMuted}>
          SYSTEM DESIGN INSPIRED BY THE IDEAS IN SNOWMOON (GPL V3). NO TEXT, CHARACTERS OR SCENES ARE REPRODUCED.
        </p>
      </div>
    </footer>
  );
}
