// File: routes/health.ts — health + admin endpoints
import { Router } from "express";
import { peerRegistry } from "../peerRegistry";
import { clock } from "../lamportClock";
import { store } from "../store";
import { getORBLog } from "../orb";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    peerId: peerRegistry.selfId(),
    lamportTime: clock.getTime(),
    auctions: store.size(),
    knownPeers: peerRegistry.all().length,
  });
});

router.get("/orb/log", (_req, res) => {
  res.json({ log: getORBLog() });
});

// Admin: force a crash (development demonstration only).
router.post("/admin/kill", (_req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_KILL !== "1") {
    return res.status(403).json({ success: false, error: "disabled in production" });
  }
  res.json({ success: true, message: "peer terminating in 200ms" });
  setTimeout(() => process.exit(1), 200);
});

export default router;
