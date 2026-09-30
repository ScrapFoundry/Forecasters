"use client";

import { useEffect, useRef, useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { Power, Wallet } from "lucide-react";
import { shortAddr } from "@/lib/format";
import s from "./shell.module.css";

export function ConnectButton() {
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!mounted) {
    return (
      <button type="button" className={s.connect} disabled>
        <Wallet size={13} aria-hidden /> CONNECT
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className={s.connectWrap} ref={ref}>
        <button type="button" className={[s.connect, s.connected].join(" ")} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className={s.connDot} aria-hidden />
          {shortAddr(address)}
        </button>
        {open ? (
          <div className={s.connectMenu} role="menu">
            <div className={s.connectMenuHead}>OPERATOR SESSION</div>
            <div className={s.connectMenuRow}>{address}</div>
            <button
              type="button"
              role="menuitem"
              className={s.connectMenuBtn}
              onClick={() => {
                disconnect.mutate();
                setOpen(false);
              }}
            >
              <Power size={12} aria-hidden /> DISCONNECT
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const unique = connectors.filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i);

  return (
    <div className={s.connectWrap} ref={ref}>
      <button type="button" className={s.connect} onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={connect.isPending}>
        <Wallet size={13} aria-hidden /> {connect.isPending ? "LINKING" : "CONNECT"}
      </button>
      {open ? (
        <div className={s.connectMenu} role="menu">
          <div className={s.connectMenuHead}>SELECT WALLET</div>
          {unique.length === 0 ? (
            <div className={s.connectMenuRow}>NO BROWSER WALLET DETECTED</div>
          ) : (
            unique.map((c) => (
              <button
                key={c.uid}
                type="button"
                role="menuitem"
                className={s.connectMenuBtn}
                onClick={() => {
                  connect.mutate({ connector: c });
                  setOpen(false);
                }}
              >
                <Wallet size={12} aria-hidden /> {c.name.toUpperCase()}
              </button>
            ))
          )}
          {connect.error ? <div className={[s.connectMenuRow, s.connectErr].join(" ")}>{connect.error.message.split("\n")[0]}</div> : null}
          <div className={s.connectMenuFoot}>BROWSING DOES NOT REQUIRE A WALLET</div>
        </div>
      ) : null}
    </div>
  );
}
