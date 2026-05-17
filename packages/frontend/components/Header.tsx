"use client";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function Header() {
  const { user, loading, logout } = useAuth();

  return (
    <header className="border-b border-white/5 bg-ink-950/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <Link href="/lobby" className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-white">Aurum</span>
          <span className="hidden sm:inline text-xs text-neutral-500">
            distributed auctions
          </span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-neutral-300">
          <Link href="/lobby" className="hover:text-white transition-colors">Lobby</Link>
          <Link href="/create" className="hover:text-white transition-colors">Create</Link>
          <Link href="/cluster" className="hover:text-white transition-colors">Cluster</Link>
          {loading ? (
            <span className="h-6 w-20 rounded bg-white/5 animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-3">
              <span className="text-neutral-400">
                {user.name || user.email}
              </span>
              <button onClick={logout} className="btn-ghost text-xs">
                Sign out
              </button>
            </div>
          ) : (
            <>
              <Link href="/login" className="hover:text-white transition-colors">
                Sign in
              </Link>
              <Link href="/register" className="btn-gold text-xs">
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
