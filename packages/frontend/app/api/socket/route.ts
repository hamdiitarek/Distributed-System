// File: app/api/socket/route.ts
// Returns the URL of a Socket.IO-capable peer for the browser to
// connect to directly. (Next.js Edge routes cannot host long-lived
// WebSocket servers; peers run Socket.IO instead.)
//
// If an auctionId is supplied, we route the client to that auction's
// coordinator peer so every viewer of the same auction streams from
// the same WebSocket — this makes the live demo consistent across
// browsers and avoids the impression that "different clients see
// different peers" implies divergent state.
import { NextRequest, NextResponse } from "next/server";
import { localizePeerUrl } from "../_peer-url";

export const dynamic = "force-dynamic";

const NS = process.env.NAMESERVICE_URL ?? "http://localhost:3001";

export async function GET(req: NextRequest) {
  const auctionId = req.nextUrl.searchParams.get("auctionId");
  try {
    const r = await fetch(`${NS}/peers`, { cache: "no-store" });
    const j = await r.json();
    const peers = (j.peers ?? []) as Array<{ peerId: string; url: string }>;
    if (peers.length === 0) {
      return NextResponse.json({ error: "no peers" }, { status: 503 });
    }

    // If we know the auction, route to its coordinator so every viewer
    // streams from the same peer.
    if (auctionId) {
      // Ask any peer for the auction; the response includes coordinatorPeerId.
      const probe = peers[0];
      try {
        const ar = await fetch(
          `${localizePeerUrl(probe.url)}/auctions/${encodeURIComponent(auctionId)}`,
          { cache: "no-store" }
        );
        const aj = await ar.json();
        const coordId = aj?.auction?.coordinatorPeerId;
        if (coordId) {
          const coord = peers.find((p) => p.peerId === coordId);
          if (coord) {
            return NextResponse.json({
              peerId: coord.peerId,
              url: localizePeerUrl(coord.url),
              replicaCount: peers.length,
            });
          }
        }
      } catch {
        // fall through to random
      }
    }

    // Fallback: random peer (used for any non-auction-bound page).
    const peer = peers[Math.floor(Math.random() * peers.length)];
    return NextResponse.json({
      peerId: peer.peerId,
      url: localizePeerUrl(peer.url),
      replicaCount: peers.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "name service error" }, { status: 503 });
  }
}
