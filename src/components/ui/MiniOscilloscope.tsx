"use client";

import { useEffect, useRef } from "react";
import s from "./hardware.module.css";

/**
 * Tiny animated trace. `level` (0..1) sets amplitude and density so the scope
 * reflects a real value (e.g. share of agents working). Pauses off screen and
 * under reduced motion.
 */
export function MiniOscilloscope({ level, height = 56, label }: { level: number | null; height?: number; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level ?? 0);
  levelRef.current = level ?? 0;

  useEffect(() => {
    const canvas = ref.current;
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
      canvas.width = Math.max(1, canvas.clientWidth * dpr);
      canvas.height = Math.max(1, canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || now - last < 40) return;
      last = now;
      t += 0.06;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(57,255,106,0.08)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo((w / 8) * i, 0);
        ctx.lineTo((w / 8) * i, h);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      const lv = 0.15 + levelRef.current * 0.85;
      ctx.strokeStyle = "#39ff6a";
      ctx.shadowColor = "rgba(57,255,106,0.6)";
      ctx.shadowBlur = 4;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const p = x / w;
        const yv =
          Math.sin(p * Math.PI * (4 + lv * 8) + t * 2) * 0.55 +
          Math.sin(p * Math.PI * 17 + t * 5) * 0.18 * lv +
          Math.sin(p * Math.PI * 2 - t) * 0.2;
        const y = h / 2 + yv * (h * 0.38) * lv;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
    });
    io.observe(canvas);
    window.addEventListener("resize", resize);
    if (reduce) {
      visible = true;
      draw(1000);
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(draw);
    }
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className={s.scope} style={{ height }} role="img" aria-label={label ?? "oscilloscope"} />;
}
