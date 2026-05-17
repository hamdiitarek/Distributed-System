"use client";
import { useEffect, useRef, useState } from "react";

type Status = "ACTIVE" | "FAILED";

interface PeerInfo {
  peerId: string;
  url: string;
  capacity: number;
  load: number;
  auctionCount: number;
  lastHeartbeat: number;
  status: Status;
  registeredAt: number;
  lamportTime: number;
}

interface ClusterEvent {
  id: number;
  t: number;
  kind: string;
  from?: string;
  to?: string;
  auctionId?: string;
  detail?: string;
}

const KIND_STYLE: Record<string, string> = {
  "replicate-out": "text-cyan-400",
  "replicate-in": "text-emerald-400",
  bid: "text-gold-400",
  assign: "text-violet-400",
  register: "text-blue-400",
  deregister: "text-red-400",
  "peer-failed": "text-red-400 font-semibold",
  elect: "text-yellow-300 font-semibold",
  participant: "text-neutral-300",
  status: "text-orange-300",
  winner: "text-pink-400",
};

function relTime(t: number, now: number): string {
  const s = Math.floor((now - t) / 1000);
  if (s < 1) return "now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function ClusterPage() {
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [events, setEvents] = useState<ClusterEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastIdRef = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const since = lastIdRef.current ? `?since=${lastIdRef.current}` : "";
        const r = await fetch(`/api/cluster${since}`, { cache: "no-store" });
        const j = await r.json();
        if (cancelled) return;
        if (j.error) {
          setError(j.error);
        } else {
          setError(null);
        }
        if (Array.isArray(j.peers)) setPeers(j.peers);
        if (Array.isArray(j.events) && j.events.length > 0) {
          // Timer ticks replicate every second across all peers and drown
          // out everything interesting. Drop them from the live log.
          const filtered = j.events.filter(
            (e: ClusterEvent) =>
              e.detail !== "timer" &&
              e.kind !== "timer" &&
              e.detail !== "participant" &&
              e.kind !== "participant"
          );
          if (filtered.length > 0) {
            setEvents((prev) => [...prev, ...filtered].slice(-200));
          }
          lastIdRef.current = j.events[j.events.length - 1].id;
        }
        setNow(Date.now());
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "fetch failed");
      }
    }

    tick();
    const t = setInterval(tick, 500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const reversed = [...events].reverse();
  const active = peers.filter((p) => p.status === "ACTIVE").length;

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Cluster</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Live view of the NameService registry and inter-peer transactions.
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-white">{active}</div>
          <div className="text-xs text-neutral-500">active peers</div>
        </div>
      </div>

      {error && (
        <div className="gild-border p-4 mb-6 text-sm text-red-400">
          NameService unreachable: {error}
        </div>
      )}

      <section className="mb-10">
        <h2 className="text-sm font-medium text-neutral-300 mb-3">Peers</h2>
        {peers.length === 0 ? (
          <div className="gild-border p-6 text-sm text-neutral-500">
            No peers registered.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {peers.map((p) => (
              <div key={p.peerId} className="gild-border p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        p.status === "ACTIVE" ? "bg-emerald-400" : "bg-red-500"
                      }`}
                    />
                    <span className="font-mono text-sm text-white">{p.peerId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.status === "ACTIVE" && (
                      <button
                        onClick={async () => {
                          await fetch("/api/cluster/crash", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ peerId: p.peerId }),
                          });
                        }}
                        className="text-[10px] px-2 py-0.5 rounded border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Mark FAILED on NameService and notify survivors. Recovers on next heartbeat (~5s)."
                      >
                        Crash
                      </button>
                    )}
                    <span className="text-[10px] text-neutral-500">
                      {relTime(p.lastHeartbeat, now)}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-neutral-500 font-mono break-all mb-3">
                  {p.url}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Stat label="Auctions" value={p.auctionCount} />
                  <Stat label="Coord" value={p.load} />
                  <Stat label="Lamport" value={p.lamportTime} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-neutral-300">Live transactions</h2>
          <span className="text-xs text-neutral-500">{events.length} recent</span>
        </div>
        <div className="gild-border divide-y divide-white/5 max-h-[28rem] overflow-auto">
          {reversed.length === 0 ? (
            <div className="p-6 text-sm text-neutral-500">
              Waiting for activity… create an auction or place a bid to see traffic.
            </div>
          ) : (
            reversed.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 px-4 py-2 text-sm font-mono"
              >
                <span className="text-[10px] text-neutral-600 w-16 shrink-0">
                  {relTime(e.t, now)}
                </span>
                <span
                  className={`w-28 shrink-0 text-xs ${KIND_STYLE[e.kind] ?? "text-neutral-400"}`}
                >
                  {e.kind}
                </span>
                <span className="flex items-center gap-1.5 text-xs flex-1 min-w-0">
                  {e.from && (
                    <span className="text-neutral-300 truncate">{e.from}</span>
                  )}
                  {e.from && e.to && (
                    <span className="text-neutral-600">→</span>
                  )}
                  {e.to && (
                    <span className="text-neutral-300 truncate">{e.to}</span>
                  )}
                </span>
                {e.detail && (
                  <span className="text-xs text-neutral-500 truncate max-w-[10rem]">
                    {e.detail}
                  </span>
                )}
                {e.auctionId && (
                  <span className="text-[10px] text-neutral-600 truncate max-w-[8rem]">
                    {e.auctionId}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-sm text-white">{value}</div>
      <div className="text-[10px] text-neutral-500">{label}</div>
    </div>
  );
}
