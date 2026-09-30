"use client";

import s from "./hardware.module.css";

/** Lever toggle switch. Accessible as role=switch. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={s.switch} onClick={() => onChange(!on)}>
      <span className={s.switchTrack}>
        <span className={s.switchLever} />
      </span>
      <span>{label}</span>
    </button>
  );
}
