// File: routes/crash.ts — demo endpoint to force-fail a peer.
// Marks the peer FAILED in the registry, records a cluster event, and
// notifies all surviving peers via /internal/peer-failed so they run
// the deterministic coordinator re-election. The crashed peer's next
// heartbeat (≈5s later) will revive it as ACTIVE.
import { Router } from "express";
import axios from "axios";
import { registry } from "../registry";
import { recordEvent } from "../events";

const router = Router();

router.post("/peers/:peerId/crash", async (req, res) => {
  const peerId = req.params.peerId;
  const peer = registry.get(peerId);
  if (!peer) return res.status(404).json({ success: false, error: "unknown peer" });
  if (peer.status !== "ACTIVE") {
    return res.status(409).json({ success: false, error: `peer is ${peer.status}` });
  }

  // Quarantine the peer for 5 seconds: even though it is still running and
  // will continue heartbeating, we treat it as FAILED for the window. This
  // makes the failure window observable on /cluster instead of instant.
  registry.markFailed(peerId, 5000);
  recordEvent({
    kind: "deregister",
    from: peerId,
    detail: "crashed (manual, 5s quarantine)",
  });

  // Fan out to survivors so they trigger coordinator re-election.
  await Promise.all(
    registry.getActivePeers().map((survivor) =>
      axios
        .post(
          `${survivor.url}/internal/peer-failed`,
          { failedPeerId: peerId },
          { timeout: 3000 }
        )
        .catch(() => undefined)
    )
  );

  res.json({ success: true, crashed: peerId });
});

export default router;
