import s from "./hardware.module.css";

interface Props {
  data: number[];
  height?: number;
  mode?: "line" | "bars" | "step";
  color?: string;
  grid?: boolean;
  label?: string;
  max?: number;
}

/** Small phosphor trace for inset screens. Pure SVG, no chart library. */
export function SignalGraph({ data, height = 60, mode = "line", color = "var(--ph)", grid = true, label, max }: Props) {
  const w = 200;
  const h = height;
  const n = Math.max(1, data.length);
  const top = Math.max(1, max ?? Math.max(...data, 1));
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => h - 3 - (v / top) * (h - 8);

  let shape: React.ReactNode = null;
  if (data.length === 0) {
    shape = (
      <text x={w / 2} y={h / 2 + 3} textAnchor="middle" fontSize="8" fill="var(--muted)" fontFamily="var(--font-mono)">
        NO SIGNAL
      </text>
    );
  } else if (mode === "bars") {
    const bw = w / n;
    shape = data.map((v, i) => (
      <rect key={i} x={i * bw + 1} y={y(v)} width={Math.max(1, bw - 2)} height={h - 3 - y(v)} fill={color} opacity={0.85} />
    ));
  } else {
    const pts =
      mode === "step"
        ? data.flatMap((v, i) => (i === 0 ? [`${x(0)},${y(v)}`] : [`${x(i)},${y(data[i - 1] ?? v)}`, `${x(i)},${y(v)}`]))
        : data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    shape = (
      <>
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="4"
          opacity="0.12"
          vectorEffect="non-scaling-stroke"
        />
      </>
    );
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={s.graph} style={{ height }} role="img" aria-label={label ?? "signal graph"}>
      {grid ? (
        <g stroke="rgba(57,255,106,0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke">
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} vectorEffect="non-scaling-stroke" />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <line key={i} y1="0" y2={h} x1={(w / 10) * (i + 1)} x2={(w / 10) * (i + 1)} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ) : null}
      {shape}
    </svg>
  );
}
