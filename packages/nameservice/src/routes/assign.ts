// File: routes/assign.ts — POST /assign-peer
// Assigns the least-loaded ACTIVE peer to coordinate a new auction.
import { Router } from "express";
import { registry } from "../registry";
import { recordEvent } from "../events";

const router = Router();

router.post("/assign-peer", (req, res) => {
  const { auctionId } = req.body ?? {};
  const assigned = registry.assignLeastLoaded();
  if (!assigned) {
    return res.status(503).json({ success: false, error: "no active peers available" });
  }
  // Optimistically attribute one more auction to the assigned peer so
  // bursts of /assign-peer requests spread across peers rather than
  // piling on whichever peer last reported zero load. The peer's next
  // heartbeat will replace this estimate with a real number.
  assigned.auctionCount += 1;
  recordEvent({
    kind: "assign",
    to: assigned.peerId,
    auctionId: auctionId ? String(auctionId) : undefined,
  });
  // eslint-disable-next-line no-console
  console.log(`[NameService] assigned ${assigned.peerId} → auction=${auctionId}`);
  res.json({
    success: true,
    auctionId,
    assignedPeer: { peerId: assigned.peerId, url: assigned.url },
    replicas: registry.getActivePeers().map((p) => ({ peerId: p.peerId, url: p.url })),
  });
});

export default router;
