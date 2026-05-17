"use client";
export interface BidLine {
  bidId: string;
  userId: string;
  userName?: string;
  amount: number;
  lamportTime: number;
  originPeerId: string;
  wallClock: number;
}

export default function BidHistory({ bids }: { bids: BidLine[] }) {
  const sorted = [...bids].sort((a, b) => {
    if (a.lamportTime !== b.lamportTime) return b.lamportTime - a.lamportTime;
    return b.originPeerId.localeCompare(a.originPeerId);
  });
  return (
    <div className="gild-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-display text-lg text-gold-200">Bid History</h4>
        <span className="text-xs uppercase tracking-widest text-gold-500/60">
          Lamport-ordered
        </span>
      </div>
      <div className="max-h-72 overflow-auto pr-2 space-y-2">
        {sorted.length === 0 && (
          <div className="text-sm text-gold-500/60 italic">No bids yet — be the first.</div>
        )}
        {sorted.map((b) => (
          <div
            key={b.bidId}
            className="flex items-center justify-between text-sm border-b border-gold-500/10 pb-2"
          >
            <div>
              <div className="text-gold-100">{b.userName ?? b.userId.slice(0, 8)}</div>
              <div className="text-[10px] tracking-wider uppercase text-gold-500/60">
                L={b.lamportTime} · {b.originPeerId}
              </div>
            </div>
            <div className="font-display text-gold-300">${b.amount.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
