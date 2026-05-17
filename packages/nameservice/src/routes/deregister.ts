// File: routes/deregister.ts — POST /deregister
import { Router } from "express";
import { registry } from "../registry";
import { recordEvent } from "../events";

const router = Router();

router.post("/deregister", (req, res) => {
  const { peerId } = req.body ?? {};
  if (!peerId) return res.status(400).json({ success: false, error: "peerId required" });
  const removed = registry.deregister(peerId);
  if (removed) recordEvent({ kind: "deregister", from: peerId });
  // eslint-disable-next-line no-console
  console.log(`[NameService] deregistered ${peerId} (existed=${removed})`);
  res.json({ success: true, removed });
});

export default router;
