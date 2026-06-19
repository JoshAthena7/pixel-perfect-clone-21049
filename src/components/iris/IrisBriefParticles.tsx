/**
 * IRIS Brief particle field — drifting gold dots rendered while a brief
 * is being generated. Pure presentation. Stops its rAF loop on unmount.
 */
import { useEffect, useRef } from "react";

const PARTICLE_COUNT = 14;
const GOLD = "rgba(196,154,43,";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  speed: number;
};

export function IrisBriefParticles({ fading }: { fading?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const w = () => canvas.getBoundingClientRect().width;
    const h = () => canvas.getBoundingClientRect().height;

    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.5;
      return {
        x: Math.random() * w(),
        y: Math.random() * h(),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        phase: Math.random() * Math.PI * 2,
        speed: 0.0008 + Math.random() * 0.0012,
      };
    });

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const width = w();
      const height = h();
      ctx.clearRect(0, 0, width, height);
      for (const p of particlesRef.current) {
        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        // wrap
        if (p.x < -2) p.x = width + 2;
        if (p.x > width + 2) p.x = -2;
        if (p.y < -2) p.y = height + 2;
        if (p.y > height + 2) p.y = -2;
        const a = (Math.sin(now * p.speed + p.phase) * 0.5 + 0.5) * 0.7;
        ctx.fillStyle = `${GOLD}${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        opacity: fading ? 0 : 1,
        transition: "opacity 300ms ease-out",
      }}
    />
  );
}
