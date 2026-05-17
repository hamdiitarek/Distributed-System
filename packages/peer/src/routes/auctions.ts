// File: routes/auctions.ts — CRUD endpoints for auctions on this peer
import { Router } from "express";
import { store } from "../store";
import { createAuction, addParticipant, removeParticipant, getPublicView } from "../auctionCoordinator";
import { clock } from "../lamportClock";

const router = Router();

router.get("/auctions", (_req, res) => {
  res.json({ auctions: store.list(), lamportTime: clock.getTime() });
});

router.post("/auctions", async (req, res) => {
  // The ORB envelope wraps the params in body.params.
  const params = req.body?.params ?? req.body ?? {};
  try {
    const auction = await createAuction({
      title: String(params.title ?? "Untitled"),
      description: String(params.description ?? ""),
      startingBid: Number(params.startingBid ?? 0),
      reservePrice: Number(params.reservePrice ?? 0),
      minParticipants: Number(params.minParticipants ?? 2),
      durationSeconds: Number(params.durationSeconds ?? 300),
    });
    res.json({ success: true, auction });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? "create failed" });
  }
});

router.get("/auctions/:id", (req, res) => {
  const view = getPublicView(req.params.id);
  if (!view) return res.status(404).json({ success: false, error: "not found" });
  res.json({ success: true, ...view });
});

router.post("/auctions/:id/join", async (req, res) => {
  const params = req.body?.params ?? req.body ?? {};
  const userId = String(params.userId ?? "");
  if (!userId) return res.status(400).json({ success: false, error: "userId required" });
  const userName = params.userName ? String(params.userName) : undefined;
  await addParticipant(req.params.id, userId, userName);
  res.json({ success: true });
});

router.post("/auctions/:id/leave", async (req, res) => {
  const params = req.body?.params ?? req.body ?? {};
  const userId = String(params.userId ?? "");
  if (!userId) return res.status(400).json({ success: false, error: "userId required" });
  await removeParticipant(req.params.id, userId);
  res.json({ success: true });
});

export default router;
