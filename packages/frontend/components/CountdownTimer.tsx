"use client";
import { useEffect, useState } from "react";

export default function CountdownTimer({
  endsAt,
  compact = false,
}: {
  endsAt: number | undefined;
  compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, Math.floor(((endsAt ?? now) - now) / 1000));
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const display = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

  if (compact) {
    return <span className="font-mono text-gold-300">{display}</span>;
  }

  // Circular ring (assumes 5 min default; scales linearly to remaining/initial).
  const TOTAL = Math.max(remaining, 1);
  const initial = Math.max(TOTAL, endsAt ? (endsAt - (endsAt - TOTAL * 1000)) / 1000 : TOTAL);
  const frac = remaining / Math.max(initial, 1);
  const C = 2 * Math.PI * 56;
  const offset = C * (1 - frac);

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="56" stroke="rgba(217,162,33,0.15)" strokeWidth="6" fill="none" />
        <circle
          cx="70"
          cy="70"
          r="56"
          stroke="url(#g)"
          strokeWidth="6"
          fill="none"
          strokeDasharray={C}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 70 70)"
        />
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop offset="0%" stopColor="#eebf4a" />
            <stop offset="100%" stopColor="#b88216" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <div className="font-display text-3xl text-gold-200">{display}</div>
        <div className="text-[10px] tracking-widest uppercase text-gold-500/70">Remaining</div>
      </div>
    </div>
  );
}
