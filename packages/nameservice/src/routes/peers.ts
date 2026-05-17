// File: routes/peers.ts — GET /peers
import { Router } from "express";
import { registry } from "../registry";

const router = Router();

router.get("/peers", (_req, res) => {
  res.json({ peers: registry.getActivePeers() });
});

router.get("/peers/all", (_req, res) => {
  res.json({ peers: registry.getAllPeers() });
});

export default router;
