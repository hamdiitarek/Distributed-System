// File: app/api/cluster/route.ts — public proxy for the NameService
// /events feed. The browser never talks to the NameService directly.
import { NextRequest, NextResponse } from "next/server";

const NS = process.env.NAMESERVICE_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get("since");
  const qs = since ? `?since=${encodeURIComponent(since)}` : "";
  try {
    const r = await fetch(`${NS}/events${qs}`, { cache: "no-store" });
    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        {
          error: `NameService ${r.status} — restart NameService to pick up /events`,
          peers: [],
          events: [],
        },
        { status: 200 }
      );
    }
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json(
        { error: "NameService returned non-JSON (old build?)", peers: [], events: [] },
        { status: 200 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "name service unreachable", peers: [], events: [] },
      { status: 200 }
    );
  }
}
