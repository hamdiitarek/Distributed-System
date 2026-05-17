// File: app/api/cluster/crash/route.ts — proxy for the demo "crash peer"
// action. Forwards to NameService /peers/:id/crash.
import { NextRequest, NextResponse } from "next/server";

const NS = process.env.NAMESERVICE_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest) {
  const { peerId } = (await req.json()) ?? {};
  if (!peerId || typeof peerId !== "string") {
    return NextResponse.json({ error: "peerId required" }, { status: 400 });
  }
  try {
    const r = await fetch(`${NS}/peers/${encodeURIComponent(peerId)}/crash`, {
      method: "POST",
    });
    const text = await r.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: r.status });
    } catch {
      return NextResponse.json(
        { error: "NameService returned non-JSON" },
        { status: 502 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "name service unreachable" },
      { status: 503 }
    );
  }
}
