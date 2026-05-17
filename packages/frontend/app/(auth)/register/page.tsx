"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { account, ID } from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await account.create(ID.unique(), email, password, name);
      await account.createEmailPasswordSession(email, password);
      await refresh();
      router.push("/lobby");
    } catch (err: any) {
      setError(err?.message ?? "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-1">Create account</h1>
      <p className="text-sm text-neutral-500 mb-8">Join the auction floor.</p>
      <form onSubmit={submit} className="gild-border p-6 space-y-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className="w-full" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full" required />
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full" required />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button className="btn-gold w-full" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
        <p className="text-xs text-neutral-500 text-center">
          Already have one?{" "}
          <a href="/login" className="text-gold-400 hover:underline">
            Sign in
          </a>
        </p>
      </form>
    </div>
  );
}
