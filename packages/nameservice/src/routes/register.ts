// File: routes/register.ts — POST /register
import { Router } from "express";
import { registry } from "../registry";
import { recordEvent } from "../events";

const router = Router();

router.post("/register", (req, res) => {
  const { peerId, url, capacity } = req.body ?? {};
  if (!peerId || !url) {
    return res.status(400).json({ success: false, error: "peerId and url are required" });
  }
  const info = registry.register(peerId, url, capacity ?? 100);
  recordEvent({ kind: "register", from: peerId, detail: url });
  // eslint-disable-next-line no-console
  console.log(`[NameService] registered ${peerId} @ ${url}`);
  res.json({
    success: true,
    peer: info,
    currentPeers: registry.getActivePeers(),
  });
});

export default router;
