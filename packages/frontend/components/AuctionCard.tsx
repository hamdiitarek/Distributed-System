"use client";
import Link from "next/link";
import CountdownTimer from "./CountdownTimer";

type Status = "PENDING" | "ACTIVE" | "ENDED";

export interface AuctionCardProps {
  id: string;
  title: string;
  highestBid?: number;
  startingBid: number;
  endsAt?: number;
  participantCount: number;
  status: Status;
}

const statusClass: Record<Status, string> = {
  PENDING: "chip chip-pending",
  ACTIVE: "chip chip-active",
  ENDED: "chip chip-ended",
};

export default function AuctionCard(p: AuctionCardProps) {
  const bid = p.highestBid ?? p.startingBid;
  return (
    <Link
      href={`/auction/${p.id}`}
      className="gild-border block p-5 hover:border-white/15 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="text-base font-medium text-white leading-tight">{p.title}</h3>
        <span className={statusClass[p.status]}>{p.status}</span>
      </div>
      <div className="text-xs text-neutral-500 mb-1">Current bid</div>
      <div className="text-2xl font-semibold text-white mb-4">
        ${bid.toLocaleString()}
      </div>
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span>{p.participantCount} bidders</span>
        {p.status === "ACTIVE" && p.endsAt ? (
          <CountdownTimer endsAt={p.endsAt} compact />
        ) : (
          <span className="opacity-70">
            {p.status === "PENDING" ? "Awaiting bidders" : "Closed"}
          </span>
        )}
      </div>
    </Link>
  );
}
