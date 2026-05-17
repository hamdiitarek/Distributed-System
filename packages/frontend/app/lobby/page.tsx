"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuctionCard from "@/components/AuctionCard";
import { ORB } from "@/lib/orb-client";

type Status = "PENDING" | "ACTIVE" | "ENDED";
const FILTERS: Array<"ALL" | Status> = ["ALL", "PENDING", "ACTIVE", "ENDED"];

interface AuctionDTO {
  id: string;
  title: string;
  startingBid: number;
  highestBid?: { amount: number };
  endsAt?: number;
  participants: string[];
  status: Status;
}

export default function LobbyPage() {
  const [auctions, setAuctions] = useState<AuctionDTO[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [loading, setLoading] = useState(true);
  const [servingPeer, setServingPeer] = useState<string | null>(null);

  async function refresh() {
    const r = await ORB.listAuctions();
    if (r.success) {
      setAuctions(r.data?.auctions ?? []);
      setServingPeer(r.data?.servingPeerId ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  const filtered = auctions.filter((a) => filter === "ALL" || a.status === filter);

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Auctions</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {servingPeer && (
              <>
                Served by peer{" "}
                <span className="font-mono text-gold-400">{servingPeer}</span>
              </>
            )}
          </p>
        </div>
        <Link href="/create" className="btn-gold">Create auction</Link>
      </div>

      <div className="flex gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-xs rounded-md border transition-colors ${
              filter === f
                ? "bg-gold-400/10 border-gold-400/50 text-gold-400"
                : "border-white/10 text-neutral-400 hover:text-white hover:border-white/20"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-neutral-500 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="gild-border p-10 text-center">
          <p className="text-lg text-white">Nothing here yet.</p>
          <p className="text-sm text-neutral-500 mt-1">No auctions match this filter.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((a) => (
            <AuctionCard
              key={a.id}
              id={a.id}
              title={a.title}
              startingBid={a.startingBid}
              highestBid={a.highestBid?.amount}
              endsAt={a.endsAt}
              participantCount={a.participants?.length ?? 0}
              status={a.status}
            />
          ))}
        </div>
      )}
    </div>
  );
}
