// File: routes/bids.ts — bid placement endpoint
import { Router } from "express";
import { placeBid } from "../auctionCoordinator";

const router = Router();

router.post("/bids", async (req, res) => {
  const params = req.body?.params ?? req.body ?? {};
  const result = await placeBid({
    auctionId: String(params.auctionId ?? ""),
    userId: String(params.userId ?? ""),
    userName: params.userName ? String(params.userName) : undefined,
    amount: Number(params.amount ?? 0),
  });
  if (result.ok) return res.json({ success: true, bid: result.bid });
  res.status(409).json({ success: false, error: result.reason });
});

export default router;
