// File: app/api/bids/route.ts — proxy to the auction's coordinator peer.
import { NextRequest, NextResponse } from "next/server";
import { localizePeerUrl } from "../_peer-url";

const NS = process.env.NAMESERVICE_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const auctionId = String(body.auctionId ?? "");
  if (!auctionId) return NextResponse.json({ error: "auctionId required" }, { status: 400 });

  // Ask NameService for a peer to serve this auction. Any peer will do
  // (active replication = identical state everywhere), but we route to
  // the least loaded one for load balancing.
  const assignRes = await fetch(`${NS}/assign-peer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auctionId }),
  });
  const raw = (await assignRes.json())?.assignedPeer;
  if (!raw) return NextResponse.json({ error: "no peer" }, { status: 503 });
  const peer = { ...raw, url: localizePeerUrl(raw.url) };

  const r = await fetch(`${peer.url}/bids`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ params: body }),
  });
  const j = await r.json();
  return NextResponse.json({ ...j, servingPeerId: peer.peerId, servingPeerUrl: peer.url }, { status: r.status });
}
