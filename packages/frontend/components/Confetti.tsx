"use client";
import { useEffect, useRef } from "react";

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  size: number;
  color: string;
}

const COLORS = ["#d9a221", "#eebf4a", "#f6d885", "#ffffff", "#22d3ee", "#f87171", "#a78bfa"];

export default function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    function resize() {
      canvas!.width = window.innerWidth * dpr;
      canvas!.height = window.innerHeight * dpr;
      canvas!.style.width = `${window.innerWidth}px`;
      canvas!.style.height = `${window.innerHeight}px`;
      ctx!.scale(dpr, dpr);
    }
    resize();

    const pieces: Piece[] = [];
    const W = window.innerWidth;
    function spawnBurst(originX: number) {
      for (let i = 0; i < 80; i++) {
        pieces.push({
          x: originX,
          y: window.innerHeight * 0.2 + Math.random() * 40,
          vx: (Math.random() - 0.5) * 8,
          vy: Math.random() * -8 - 2,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.3,
          size: 6 + Math.random() * 6,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
        });
      }
    }
    spawnBurst(W * 0.25);
    spawnBurst(W * 0.75);
    setTimeout(() => spawnBurst(W * 0.5), 250);
    setTimeout(() => spawnBurst(W * 0.4), 600);
    setTimeout(() => spawnBurst(W * 0.6), 600);

    let raf = 0;
    let running = true;
    function tick() {
      if (!running) return;
      ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.vy += 0.18; // gravity
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        if (p.y > window.innerHeight + 40) {
          pieces.splice(i, 1);
          continue;
        }
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx!.restore();
      }
      raf = requestAnimationFrame(tick);
    }
    tick();

    window.addEventListener("resize", resize);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-50 pointer-events-none"
    />
  );
}
