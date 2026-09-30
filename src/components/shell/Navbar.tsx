"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { LogoMark } from "./Logo";
import { ConnectButton } from "./ConnectButton";
import { TokenCA } from "./TokenCA";
import { useLive } from "./LiveDataProvider";
import { useNow } from "./useNow";
import { StatusLED } from "@/components/ui/StatusLED";
import { publicConfig } from "@/lib/config/public";
import s from "./shell.module.css";

const NAV: { href: string; label: string; external?: boolean }[] = [
  { href: "/docs", label: "DOCS" },
  { href: publicConfig.explorerUrl, label: "EXPLORER", external: true },
  { href: "/agents", label: "AGENTS" },
  { href: "/forecasts", label: "FORECASTS" },
  { href: "/oracle", label: "ORACLE" },
  { href: "/swarm", label: "SWARM" },
  { href: "/track-record", label: "RECORD" },
  { href: "/snowmoon", label: "CH.27" },
  { href: publicConfig.imdUrl, label: "$IMD", external: true },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const live = useLive();
  const now = useNow(1000);
  const overall = live.overall(now);

  useEffect(() => setOpen(false), [pathname]);

  const led = overall === "OPERATIONAL" ? "on" : overall === "SYNCING" ? "idle" : overall === "OFFLINE" ? "err" : "warn";

  return (
    <header className={s.nav}>
      <div className={s.navInner}>
        <Link href="/" className={s.brand} aria-label="FORECASTERS home">
          <LogoMark size={38} />
          <span>FORECASTERS</span>
        </Link>

        <nav className={s.links} aria-label="primary">
          {NAV.map((n) =>
            n.external ? (
              <a key={n.label} href={n.href} target="_blank" rel="noopener noreferrer" className={s.link}>
                {n.label}
                <sup>↗</sup>
              </a>
            ) : (
              <Link
                key={n.label}
                href={n.href}
                className={[s.link, pathname === n.href || pathname.startsWith(`${n.href}/`) ? s.active : ""].join(" ")}
              >
                {n.label}
              </Link>
            ),
          )}
        </nav>

        <div className={s.navRight}>
          <span className={s.sys}>
            <TokenCA variant="compact" />
          </span>
          <span className={s.sys}>
            SYSTEM: <StatusLED state={led} blink={overall !== "OPERATIONAL"} label={overall} />
          </span>
          <ConnectButton />
          <button type="button" className={s.burger} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mobile-menu" aria-label="menu">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open ? (
        <div id="mobile-menu" className={s.mobile}>
          <div className={s.mobileHead}>
            <span>&gt; FORECASTERS://MENU</span>
            <StatusLED state={led} label={overall} />
          </div>
          <div style={{ padding: "4px 0 10px" }}>
            <TokenCA variant="compact" />
          </div>
          <ul>
            <li>
              <Link href="/">&gt; HOME</Link>
            </li>
            {NAV.map((n) => (
              <li key={n.label}>
                {n.external ? (
                  <a href={n.href} target="_blank" rel="noopener noreferrer">
                    &gt; {n.label} ↗
                  </a>
                ) : (
                  <Link href={n.href}>&gt; {n.label}</Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  );
}
