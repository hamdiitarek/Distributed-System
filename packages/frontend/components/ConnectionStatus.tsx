"use client";

type AuctionStatus = "PENDING" | "ACTIVE" | "ENDED";

export default function ConnectionStatus({
  connected,
  peerId,
  auctionStatus,
}: {
  connected: boolean;
  peerId?: string;
  auctionStatus?: AuctionStatus;
}) {
  let label = "Disconnected";
  let dotClass = "bg-red-500";
  let textClass = "text-red-300";

  if (!connected) {
    // keep red
  } else if (auctionStatus === "ENDED") {
    label = "Ended";
    dotClass = "bg-neutral-500";
    textClass = "text-neutral-400";
  } else if (auctionStatus === "PENDING") {
    label = "Pending";
    dotClass = "bg-yellow-400";
    textClass = "text-yellow-300";
  } else if (auctionStatus === "ACTIVE") {
    label = "Live";
    dotClass = "bg-emerald-400";
    textClass = "text-emerald-300";
  } else {
    label = "Live";
    dotClass = "bg-emerald-400";
    textClass = "text-emerald-300";
  }

  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-widest">
      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
      <span className={textClass}>{label}</span>
      {peerId && <span className="text-neutral-500">· via {peerId}</span>}
    </div>
  );
}
