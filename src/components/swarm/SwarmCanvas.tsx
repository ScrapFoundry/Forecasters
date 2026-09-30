"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLive } from "@/components/shell/LiveDataProvider";
import type { SwarmSeat } from "@/lib/imd/types";
import { fmtAgo, fmtInt } from "@/lib/format";
import s from "./swarm.module.css";

export interface SwarmOverlay {
  forecasting: string[];
  correct: string[];
  incorrect: string[];
  resolving: string[];
  demo: boolean;
}

type NodeState = "OFFLINE" | "ONLINE" | "WORKING" | "FORECASTING" | "RESOLVING" | "CORRECT" | "INCORRECT";

interface Node {
  seat: SwarmSeat;
  x: number;
  y: number;
  r: number;
  state: NodeState;
  pulse: number; // 0..1 remaining ripple
}

export const NODE_COLORS: Record<NodeState, string> = {
  OFFLINE: "#2a2d2a",
  ONLINE: "#1f9e47",
  WORKING: "#39ff6a",
  FORECASTING: "#d8c94a",
  RESOLVING: "#e8e8e2",
  CORRECT: "#39ff6a",
  INCORRECT: "#d34b4b",
};

/**
 * Seat state mapping (real IMD data):
 *   WORKING  seat.working is true
 *   ONLINE   worked within the last 6h (ACTIVE)
 *   OFFLINE  no recent work (IDLE / DORMANT / UNKNOWN)
 * Overlay states come from the forecast ledger (labeled DEMO when seeded).
 */
function stateFor(seat: SwarmSeat, ov: SwarmOverlay | null): NodeState {
  if (ov) {
    if (ov.correct.includes(seat.tokenId)) return "CORRECT";
    if (ov.incorrect.includes(seat.tokenId)) return "INCORRECT";
    if (ov.resolving.includes(seat.tokenId)) return "RESOLVING";
    if (ov.forecasting.includes(seat.tokenId)) return "FORECASTING";
  }
  if (seat.activity === "WORKING") return "WORKING";
  if (seat.activity === "ACTIVE") return "ONLINE";
  return "OFFLINE";
}

export function SwarmCanvas({ height = 560, overlay = null, interactive = true }: { height?: number; overlay?: SwarmOverlay | null; interactive?: boolean }) {
  const live = useLive();
  const router = useRouter();
  const seats = useMemo(() => live.swarm.data?.seats ?? [], [live.swarm.data]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const prevRef = useRef<Map<string, string>>(new Map());
  const [hover, setHover] = useState<{ node: Node; x: number; y: number } | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const dirtyRef = useRef(true);

  // (re)layout on data change: phyllotaxis spiral ordered by token id
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    sizeRef.current = { w, h };
    const n = seats.length;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const maxR = Math.min(w, h) * 0.46;
    const spacing = n > 0 ? maxR / Math.sqrt(n) : 10;
    const dot = Math.max(1.6, Math.min(4.2, spacing * 0.36));
    const prev = prevRef.current;
    const next = new Map<string, string>();

    nodesRef.current = seats.map((seat, i) => {
      const rr = spacing * Math.sqrt(i + 0.5);
      const a = i * golden;
      const sig = `${seat.lastActivityAt ?? ""}|${seat.working}`;
      next.set(seat.tokenId, sig);
      const changed = prev.size > 0 && prev.get(seat.tokenId) !== sig;
      const old = nodesRef.current.find((x) => x.seat.tokenId === seat.tokenId);
      return {
        seat,
        x: w / 2 + Math.cos(a) * rr * (w > h * 1.4 ? 1.35 : 1),
        y: h / 2 + Math.sin(a) * rr,
        r: dot,
        state: stateFor(seat, overlay),
        pulse: changed ? 1 : old?.pulse ?? 0,
      };
    });
    prevRef.current = next;
    dirtyRef.current = true;
  }, [seats, overlay]);

  // render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let visible = true;
    let t = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { w, h } = sizeRef.current;
      if (w && (w !== canvas.clientWidth || h !== canvas.clientHeight)) {
        const sx = canvas.clientWidth / w;
        const sy = canvas.clientHeight / h;
        nodesRef.current.forEach((nd) => {
          nd.x *= sx;
          nd.y *= sy;
        });
        sizeRef.current = { w: canvas.clientWidth, h: canvas.clientHeight };
      }
    };
    resize();

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      if ((!visible && !dirtyRef.current) || ts - last < 33) return;
      dirtyRef.current = false;
      last = ts;
      t += 0.033;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // rings
      ctx.strokeStyle = "rgba(57,255,106,0.06)";
      ctx.lineWidth = 1;
      for (let k = 1; k <= 4; k++) {
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, (Math.min(w, h) * 0.12 * k) * (w > h * 1.4 ? 1.35 : 1), Math.min(w, h) * 0.12 * k, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // sweep
      const sweep = (t * 0.6) % (Math.PI * 2);
      const grad = ctx.createConicGradient ? ctx.createConicGradient(sweep, w / 2, h / 2) : null;
      if (grad) {
        grad.addColorStop(0, "rgba(57,255,106,0.10)");
        grad.addColorStop(0.08, "rgba(57,255,106,0)");
        grad.addColorStop(1, "rgba(57,255,106,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      const nodes = nodesRef.current;
      // signal lines from core to working nodes
      ctx.lineWidth = 0.6;
      for (const nd of nodes) {
        if (nd.state !== "WORKING") continue;
        ctx.strokeStyle = `rgba(57,255,106,${0.1 + 0.08 * Math.sin(t * 3 + nd.x)})`;
        ctx.beginPath();
        ctx.moveTo(w / 2, h / 2);
        ctx.lineTo(nd.x, nd.y);
        ctx.stroke();
      }

      for (const nd of nodes) {
        const c = NODE_COLORS[nd.state];
        const glow = nd.state === "WORKING" || nd.state === "CORRECT" || nd.state === "FORECASTING";
        let r = nd.r;
        if (nd.state === "WORKING") r *= 1 + 0.25 * Math.sin(t * 4 + nd.y);
        ctx.fillStyle = c;
        if (glow) {
          ctx.shadowColor = c;
          ctx.shadowBlur = 6;
        }
        ctx.beginPath();
        ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (nd.state === "CORRECT" || nd.state === "INCORRECT") {
          ctx.strokeStyle = c;
          ctx.lineWidth = 1.2;
          const k = r + 2.5;
          ctx.beginPath();
          if (nd.state === "CORRECT") {
            ctx.moveTo(nd.x - k * 0.7, nd.y);
            ctx.lineTo(nd.x - k * 0.15, nd.y + k * 0.55);
            ctx.lineTo(nd.x + k * 0.8, nd.y - k * 0.6);
          } else {
            ctx.moveTo(nd.x - k * 0.6, nd.y - k * 0.6);
            ctx.lineTo(nd.x + k * 0.6, nd.y + k * 0.6);
            ctx.moveTo(nd.x + k * 0.6, nd.y - k * 0.6);
            ctx.lineTo(nd.x - k * 0.6, nd.y + k * 0.6);
          }
          ctx.stroke();
        }

        if (nd.pulse > 0) {
          const pr = nd.r + (1 - nd.pulse) * 22;
          ctx.strokeStyle = `rgba(57,255,106,${nd.pulse * 0.8})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(nd.x, nd.y, pr, 0, Math.PI * 2);
          ctx.stroke();
          nd.pulse = Math.max(0, nd.pulse - 0.012);
        }
      }

      // core
      ctx.fillStyle = "#e8e8e2";
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
    });
    io.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(frame);
    if (reduce) {
      // draw a few frames then hold
      setTimeout(() => cancelAnimationFrame(raf), 400);
    }
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  const pick = (e: React.MouseEvent<HTMLCanvasElement>): Node | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: Node | null = null;
    let bd = 100;
    for (const nd of nodesRef.current) {
      const d = (nd.x - x) ** 2 + (nd.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = nd;
      }
    }
    return best;
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const seat of seats) {
      const st = stateFor(seat, overlay);
      c[st] = (c[st] ?? 0) + 1;
    }
    return c;
  }, [seats, overlay]);

  const status = live.status("swarm", Date.now());

  return (
    <div className={s.wrap} style={{ height }}>
      <canvas
        ref={canvasRef}
        className={s.canvas}
        onMouseMove={
          interactive
            ? (e) => {
                const nd = pick(e);
                const rect = e.currentTarget.getBoundingClientRect();
                setHover(nd ? { node: nd, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
              }
            : undefined
        }
        onMouseLeave={() => setHover(null)}
        onClick={
          interactive
            ? (e) => {
                const nd = pick(e);
                if (nd) router.push(`/agents/${nd.seat.tokenId}`);
              }
            : undefined
        }
        role="img"
        aria-label={`IMD swarm: ${seats.length} seats, ${counts.WORKING ?? 0} working`}
      />
      <div className={s.hud}>
        IMD SWARM // {fmtInt(seats.length)} SEATS
        <br />
        WORKING {counts.WORKING ?? 0} · ACTIVE 6H {counts.ONLINE ?? 0}
      </div>
      {overlay ? (
        <div className={[s.hud, s.hudRight].join(" ")}>
          {overlay.demo ? "OVERLAY: DEMO DATA" : "OVERLAY: FORECAST LEDGER"}
          <br />
          FORECASTING {counts.FORECASTING ?? 0} · ✓ {counts.CORRECT ?? 0} · × {counts.INCORRECT ?? 0}
        </div>
      ) : null}
      {seats.length === 0 ? (
        <div className={s.empty}>{status === "SYNCING" ? "> MAPPING SWARM..." : "> SWARM DATA UNAVAILABLE"}</div>
      ) : null}
      {hover ? (
        <div className={s.tip} style={{ left: Math.min(hover.x, sizeRef.current.w - 200), top: Math.min(hover.y, height - 120) }}>
          <b>IMD #{hover.node.seat.tokenId}</b>
          <br />
          STATE {hover.node.state}
          <br />
          ACCEPTED {fmtInt(hover.node.seat.accepted)} / {fmtInt(hover.node.seat.attempts)}
          <br />
          LAST WORK {fmtAgo(hover.node.seat.lastActivityAt)}
        </div>
      ) : null}
    </div>
  );
}

export function SwarmLegend({ withOverlay }: { withOverlay: boolean }) {
  const items: NodeState[] = withOverlay
    ? ["OFFLINE", "ONLINE", "WORKING", "FORECASTING", "RESOLVING", "CORRECT", "INCORRECT"]
    : ["OFFLINE", "ONLINE", "WORKING"];
  const desc: Partial<Record<NodeState, string>> = { ONLINE: "ACTIVE 6H", OFFLINE: "NO RECENT WORK" };
  return (
    <div className={s.legend}>
      {items.map((k) => (
        <span key={k}>
          <i className={s.sw} style={{ background: NODE_COLORS[k], boxShadow: k === "WORKING" ? "0 0 6px #39ff6a" : undefined }} />
          {k}
          {desc[k] ? ` (${desc[k]})` : ""}
        </span>
      ))}
    </div>
  );
}
