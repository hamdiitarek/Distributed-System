"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { account } from "@/lib/appwrite";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await account.createEmailPasswordSession(email, password);
      await refresh();
      router.push("/lobby");
    } catch (err: any) {
      setError(err?.message ?? "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <h1 className="text-3xl font-semibold tracking-tight text-white mb-1">Sign in</h1>
      <p className="text-sm text-neutral-500 mb-8">Welcome back.</p>
      <form onSubmit={submit} className="gild-border p-6 space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full"
          required
        />
        {error && <div className="text-sm text-red-400">{error}</div>}
        <button className="btn-gold w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-xs text-neutral-500 text-center">
          New here?{" "}
          <a href="/register" className="text-gold-400 hover:underline">
            Create an account
          </a>
        </p>
      </form>
    </div>
  );
}
