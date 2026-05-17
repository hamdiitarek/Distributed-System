// File: routes/peerJoin.ts — state-transfer + RA + internal endpoints
import { Router } from "express";
import { buildSnapshot } from "../stateSync";
import { ricartAgrawala } from "../ricartAgrawala";
import { clock } from "../lamportClock";
import { onPeerFailed } from "../auctionCoordinator";
import { peerRegistry } from "../peerRegistry";

const router = Router();

// Full state for a joining peer.
router.get("/peer/state", (_req, res) => {
  res.json(buildSnapshot());
});

// Ricart–Agrawala REQUEST handler.
router.post("/ra/request", async (req, res) => {
  const { resourceId, ts, peerId } = req.body ?? {};
  if (!resourceId || typeof ts !== "number" || !peerId)
    return res.status(400).json({ success: false, error: "bad RA REQUEST" });
  const { defer } = ricartAgrawala.handleIncomingRequest(resourceId, ts, peerId);
  if (!defer) {
    // Reply immediately, asynchronously.
    const replyTs = clock.tick();
    const peer = peerRegistry.get(peerId);
    if (peer) {
      // Fire-and-forget; failures are tolerated.
      import("axios").then(({ default: axios }) =>
        axios
          .post(`${peer.url}/ra/reply`, { resourceId, ts: replyTs, peerId: peerRegistry.selfId() }, { timeout: 5000 })
          .catch(() => undefined)
      );
    }
  }
  res.json({ success: true, deferred: defer });
});

// Ricart–Agrawala REPLY handler.
router.post("/ra/reply", (req, res) => {
  const { resourceId, ts, peerId } = req.body ?? {};
  if (!resourceId || !peerId) return res.status(400).json({ success: false });
  if (typeof ts === "number") clock.receive(ts);
  ricartAgrawala.markReplyReceived(resourceId, peerId);
  res.json({ success: true });
});

// Notification from NameService that another peer has crashed.
router.post("/internal/peer-failed", (req, res) => {
  const { failedPeerId } = req.body ?? {};
  if (!failedPeerId) return res.status(400).json({ success: false });
  // eslint-disable-next-line no-console
  console.warn(`[peer] notified: ${failedPeerId} has failed`);
  onPeerFailed(failedPeerId);
  res.json({ success: true });
});

// Diagnostic dump used by the DSInfoPanel.
router.get("/diag", (_req, res) => {
  res.json({
    self: peerRegistry.selfId(),
    lamportTime: clock.getTime(),
    peers: peerRegistry.all(),
    ricartAgrawala: ricartAgrawala.snapshot(),
  });
});

export default router;
