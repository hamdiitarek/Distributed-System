import { Router } from "express";
import { applyReplicatedOperation, ReplicationEnvelope } from "../replication";

const router = Router();

function handle(req: any, res: any) {
  const env = req.body as ReplicationEnvelope;
  if (!env?.op) return res.status(400).json({ success: false, error: "missing op" });
  applyReplicatedOperation(env);
  res.json({ success: true });
}

router.post("/replicate/bid", handle);
router.post("/replicate/status", handle);
router.post("/replicate/timer", handle);
router.post("/replicate/participant", handle);
router.post("/replicate/auction", handle);
router.post("/replicate/winner", handle);

export default router;
