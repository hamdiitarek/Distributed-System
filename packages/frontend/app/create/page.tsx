"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ORB } from "@/lib/orb-client";

export default function CreatePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "Antique Pocket Watch",
    description: "A rare 19th-century timepiece.",
    startingBid: 100,
    reservePrice: 500,
    minParticipants: 2,
    durationSeconds: 300,
  });
  const [submitting, setSubmitting] = useState(false);
  const [assigned, setAssigned] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    const r = await ORB.createAuction(form);
    setSubmitting(false);
    if (!r.success) return setError(r.error ?? "Failed to create");
    setAssigned(r.data?.servingPeerId ?? null);
    setTimeout(() => router.push(`/auction/${r.data?.auction?.id}`), 900);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-1">New auction</h1>
      <p className="text-sm text-neutral-500 mb-8">Create a new auction lot.</p>

      <div className="gild-border p-6 space-y-4">
        <Field label="Title">
          <input value={form.title} onChange={(e) => set("title", e.target.value)} className="w-full" />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className="w-full min-h-[6rem]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Starting bid ($)">
            <input
              type="number"
              value={form.startingBid}
              onChange={(e) => set("startingBid", Number(e.target.value))}
              className="w-full"
            />
          </Field>
          <Field label="Reserve price ($)">
            <input
              type="number"
              value={form.reservePrice}
              onChange={(e) => set("reservePrice", Number(e.target.value))}
              className="w-full"
            />
          </Field>
          <Field label="Min participants">
            <input
              type="number"
              value={form.minParticipants}
              min={1}
              onChange={(e) => set("minParticipants", Number(e.target.value))}
              className="w-full"
            />
          </Field>
          <Field label="Duration (s)">
            <input
              type="number"
              value={form.durationSeconds}
              min={10}
              onChange={(e) => set("durationSeconds", Number(e.target.value))}
              className="w-full"
            />
          </Field>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}
        {assigned && (
          <div className="text-sm text-gold-400">
            Assigned to coordinator peer{" "}
            <span className="font-mono">{assigned}</span> — redirecting…
          </div>
        )}

        <button onClick={submit} disabled={submitting} className="btn-gold w-full">
          {submitting ? "Submitting…" : "Create auction"}
        </button>
        <p className="text-[11px] text-neutral-500 text-center">
          Routed through ORB → NameService → assigned peer
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-neutral-400 mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}
