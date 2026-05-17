"use client";
import { useState } from "react";

export default function DSInfoPanel({
  servingPeerId,
  replicaCount,
  lamportTime,
  mutexState,
}: {
  servingPeerId?: string;
  replicaCount?: number;
  lamportTime?: number;
  mutexState?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="gild-border rounded-xl p-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <h4 className="font-display text-lg text-gold-200">Distributed Systems Telemetry</h4>
        <span className="text-gold-500/60 text-sm">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-gold-500/70 uppercase text-[10px] tracking-widest">Serving peer</dt>
          <dd className="text-gold-100 text-right font-mono">{servingPeerId ?? "—"}</dd>

          <dt className="text-gold-500/70 uppercase text-[10px] tracking-widest">Replicas</dt>
          <dd className="text-gold-100 text-right font-mono">{replicaCount ?? "—"}</dd>

          <dt className="text-gold-500/70 uppercase text-[10px] tracking-widest">Lamport time</dt>
          <dd className="text-gold-100 text-right font-mono">{lamportTime ?? 0}</dd>

          <dt className="text-gold-500/70 uppercase text-[10px] tracking-widest">R-A mutex</dt>
          <dd className="text-gold-100 text-right font-mono">{mutexState ?? "idle"}</dd>

          <dt className="text-gold-500/70 uppercase text-[10px] tracking-widest">Consistency</dt>
          <dd className="text-gold-100 text-right">Sequential</dd>

          <dt className="text-gold-500/70 uppercase text-[10px] tracking-widest">Replication</dt>
          <dd className="text-gold-100 text-right">Active (all replicas write)</dd>
        </dl>
      )}
    </div>
  );
}
