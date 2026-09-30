import s from "./hardware.module.css";

interface Props {
  /** 0..1, null parks the needle and shows UNKNOWN */
  value: number | null;
  label: string;
  readout?: string;
  minLabel?: string;
  maxLabel?: string;
  dark?: boolean;
  redline?: number;
}

/** Semicircular analog meter with printed scale. */
export function AnalogGauge({ value, label, readout, minLabel = "0", maxLabel = "100", dark = false, redline }: Props) {
  const v = value === null || !Number.isFinite(value) ? null : Math.max(0, Math.min(1, value));
  const angle = v === null ? -95 : -90 + v * 180;
  const ink = dark ? "#b8b8b2" : "#1d1d1b";
  const ticks = Array.from({ length: 21 }, (_, i) => i);
  return (
    <div className={s.gauge}>
      <svg viewBox="0 0 120 72" className={s.gaugeFace} role="img" aria-label={`${label} ${readout ?? ""}`}>
        <path d="M8 60 A52 52 0 0 1 112 60" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.7" />
        {redline !== undefined ? (
          <path
            d={arc(60, 60, 49, -90 + redline * 180, 90)}
            fill="none"
            stroke="#d34b4b"
            strokeWidth="3"
            opacity="0.8"
          />
        ) : null}
        {ticks.map((i) => {
          const a = ((-90 + i * 9) * Math.PI) / 180;
          const long = i % 5 === 0;
          const r1 = long ? 42 : 46;
          return (
            <line
              key={i}
              x1={r2(60 + Math.sin(a) * r1)}
              y1={r2(60 - Math.cos(a) * r1)}
              x2={r2(60 + Math.sin(a) * 51)}
              y2={r2(60 - Math.cos(a) * 51)}
              stroke={ink}
              strokeWidth={long ? 1.1 : 0.6}
            />
          );
        })}
        <text x="10" y="70" fontSize="6" fill={ink} fontFamily="var(--font-mono)">{minLabel}</text>
        <text x="110" y="70" fontSize="6" fill={ink} textAnchor="end" fontFamily="var(--font-mono)">{maxLabel}</text>
        <g className={s.gaugeNeedle} style={{ transform: `rotate(${angle}deg)` }}>
          <line x1="60" y1="62" x2="60" y2="14" stroke={dark ? "#39ff6a" : "#b23a2e"} strokeWidth="1.3" />
        </g>
        <circle cx="60" cy="60" r="4" fill={dark ? "#2a2a27" : "#3b3b37"} stroke={ink} strokeWidth="0.6" />
      </svg>
      <span className={s.gaugeReadout}>{v === null ? "UNKNOWN" : readout ?? `${Math.round(v * 100)}`}</span>
      <span className={s.gaugeLabel}>{label}</span>
    </div>
  );
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const p = (d: number) => {
    const a = (d * Math.PI) / 180;
    return [cx + Math.sin(a) * r, cy - Math.cos(a) * r] as const;
  };
  const [x1, y1] = p(fromDeg);
  const [x2, y2] = p(toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}
