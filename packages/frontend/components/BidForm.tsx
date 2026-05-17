"use client";
import { useEffect, useState } from "react";

export default function BidForm({
  currentBid,
  minIncrement = 1,
  disabled,
  onSubmit,
}: {
  currentBid: number;
  minIncrement?: number;
  disabled?: boolean;
  onSubmit: (amount: number) => Promise<{ ok: boolean; error?: string }>;
}) {
  const minNext = currentBid + minIncrement;
  const [amount, setAmount] = useState(minNext);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Whenever the highest bid moves, snap the input to the new minimum.
  // If the user had a higher custom value typed, keep it.
  useEffect(() => {
    setAmount((prev) => (prev > minNext ? prev : minNext));
  }, [minNext]);

  async function go() {
    setError(null);
    const next = Math.max(amount, minNext);
    if (next <= currentBid) {
      setError(`Bid must exceed $${currentBid.toLocaleString()}`);
      return;
    }
    setSubmitting(true);
    const r = await onSubmit(next);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error ?? "Bid rejected");
    }
    // On success, the parent will push a new currentBid which re-snaps amount.
  }

  return (
    <div className="gild-border p-5">
      <div className="text-xs text-neutral-500 mb-2">Place a bid</div>
      <div className="flex items-center gap-3">
        <span className="text-2xl text-neutral-400">$</span>
        <input
          type="number"
          value={amount}
          min={minNext}
          step={minIncrement}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="flex-1 text-2xl font-semibold"
          disabled={disabled || submitting}
        />
        <button
          onClick={go}
          disabled={disabled || submitting}
          className="btn-gold whitespace-nowrap"
        >
          {submitting ? "Bidding…" : "Raise"}
        </button>
      </div>
      {error && <div className="mt-2 text-sm text-red-400">{error}</div>}
      <div className="mt-2 text-xs text-neutral-500">
        Minimum next bid: ${minNext.toLocaleString()}
      </div>
    </div>
  );
}
