// File: routes/events.ts — public event stream for /cluster dashboard
import { Router } from "express";
import { listEvents, recordEvent, ClusterEventKind } from "../events";
import { registry } from "../registry";

const router = Router();

// GET /events?since=<id>  — returns events newer than <id>
router.get("/events", (req, res) => {
  const since = req.query.since ? Number(req.query.since) : undefined;
  res.json({
    events: listEvents(Number.isFinite(since) ? (since as number) : undefined),
    peers: registry.getAllPeers(),
    t: Date.now(),
  });
});

// POST /events  — peers report cluster activity here
router.post("/events", (req, res) => {
  const { kind, from, to, auctionId, detail } = req.body ?? {};
  if (!kind || typeof kind !== "string") {
    return res.status(400).json({ success: false, error: "kind required" });
  }
  recordEvent({
    kind: kind as ClusterEventKind,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
    auctionId: auctionId ? String(auctionId) : undefined,
    detail: detail ? String(detail).slice(0, 200) : undefined,
  });
  res.json({ success: true });
});

export default router;
