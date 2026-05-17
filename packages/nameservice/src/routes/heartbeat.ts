// File: routes/heartbeat.ts — POST /heartbeat
import { Router } from "express";
import { registry } from "../registry";
import { recordEvent } from "../events";

const router = Router();

router.post("/heartbeat", (req, res) => {
  const { peerId, load, auctionCount, lamportTime } = req.body ?? {};
  if (!peerId) return res.status(400).json({ success: false, error: "peerId required" });
  const { known, revived } = registry.heartbeat(
    peerId,
    load ?? 0,
    auctionCount ?? 0,
    lamportTime ?? 0
  );
  if (!known) {
    // Peer is unknown — ask it to (re-)register.
    return res.status(404).json({ success: false, error: "unknown peer; re-register" });
  }
  if (revived) {
    recordEvent({
      kind: "register",
      from: peerId,
      detail: "revived — re-syncing state",
    });
  }
  // Hint to the peer: if you were marked failed while you were down, the
  // rest of the cluster may have moved on (re-elected coordinators, etc).
  // Re-sync your full state before serving traffic again.
  res.json({ success: true, t: Date.now(), shouldResync: revived });
});

export default router;
