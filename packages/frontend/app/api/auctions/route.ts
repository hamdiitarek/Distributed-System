// ═══════════════════════════════════════════════════════
// File: app/api/auctions/route.ts
// Role: Server-side ORB proxy. The browser never knows peer URLs.
//   GET  ?id=…  → fetch a single auction from a load-balanced peer
//   GET         → list auctions from any active peer
//   POST        → ask NameService for an assigned peer, create auction
// ═══════════════════════════════════════════════════════
import { NextRequest, NextResponse } from "next/server";
import { localizePeerUrl } from "../_peer-url";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NS = process.env.NAMESERVICE_URL ?? "http://localhost:3001";

async function anyActivePeer(): Promise<{ peerId: string; url: string } | null> {
  try {
    const r = await fetch(`${NS}/peers`, { cache: "no-store" });
    const j = await r.json();
    const peers = (j.peers ?? []) as Array<{ peerId: string; url: string }>;
    const p = peers[0];
    return p ? { ...p, url: localizePeerUrl(p.url) } : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const peer = await anyActivePeer();
  if (!peer) return NextResponse.json({ error: "no peers available" }, { status: 503 });

  const url = id ? `${peer.url}/auctions/${encodeURIComponent(id)}` : `${peer.url}/auctions`;
  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();
  return NextResponse.json({ ...j, servingPeerId: peer.peerId, servingPeerUrl: peer.url });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const id = `auc_${Date.now().toString(36)}`;
  const assignRes = await fetch(`${NS}/assign-peer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auctionId: id }),
  });
  const assignJson = await assignRes.json();
  const raw = assignJson?.assignedPeer;
  if (!raw) return NextResponse.json({ error: "NameService failed to assign" }, { status: 503 });
  const peer = { ...raw, url: localizePeerUrl(raw.url) };

  const r = await fetch(`${peer.url}/auctions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ params: body }),
  });
  const j = await r.json();
  return NextResponse.json({ ...j, servingPeerId: peer.peerId, servingPeerUrl: peer.url });
}
