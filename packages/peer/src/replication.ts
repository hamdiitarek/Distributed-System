import axios from "axios";
import { clock, lamportCompare } from "./lamportClock";
import { peerRegistry } from "./peerRegistry";
import { store, Auction, Bid, AuctionStatus } from "./store";
import { reportEvent } from "./clusterEvents";

export type ReplicatedOp =
  | { kind: "bid"; auctionId: string; bid: Bid }
  | { kind: "status"; auctionId: string; status: AuctionStatus; endsAt?: number }
  | { kind: "timer"; auctionId: string; timeRemaining: number }
  | { kind: "participant"; auctionId: string; userId: string; userName?: string; action: "join" | "leave" }
  | { kind: "auction"; auction: Auction }
  | { kind: "winner"; auctionId: string; userId: string; amount: number };

export interface ReplicationEnvelope {
  op: ReplicatedOp;
  lamportTime: number;
  originPeerId: string;
}

type Listener = (op: ReplicatedOp) => void;
const listeners: Listener[] = [];
export function onReplicatedOp(fn: Listener) {
  listeners.push(fn);
}

function emit(op: ReplicatedOp) {
  for (const fn of listeners) {
    try {
      fn(op);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[replication] listener error", err);
    }
  }
}

/**
 * Send a write op to every other peer. Caller has already applied it
 * locally (or will, depending on op). Failures are swallowed: the
 * NameService heartbeat layer will eventually flag the dead peer.
 */
export async function broadcastToAllPeers(op: ReplicatedOp): Promise<void> {
  const lamportTime = clock.tick();
  const envelope: ReplicationEnvelope = {
    op,
    lamportTime,
    originPeerId: peerRegistry.selfId(),
  };

  const path = pathFor(op.kind);
  const auctionId = (op as any).auctionId ?? (op as any).auction?.id;
  await Promise.all(
    peerRegistry.others().map((peer) => {
      if (op.kind !== "timer") {
        reportEvent({
          kind: "replicate-out",
          from: peerRegistry.selfId(),
          to: peer.peerId,
          auctionId,
          detail: op.kind,
        });
      }
      return axios
        .post(`${peer.url}${path}`, envelope, { timeout: 5000 })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(`[replicate→${peer.peerId}] ${op.kind} failed: ${err?.message ?? err}`);
        });
    })
  );
}

function pathFor(kind: ReplicatedOp["kind"]): string {
  switch (kind) {
    case "bid":
      return "/replicate/bid";
    case "status":
      return "/replicate/status";
    case "timer":
      return "/replicate/timer";
    case "participant":
      return "/replicate/participant";
    case "auction":
      return "/replicate/auction";
    case "winner":
      return "/replicate/winner";
  }
}

/**
 * Apply an inbound replicated operation. Per-auction write queue
 * sorts bids by Lamport time before applying so that out-of-order
 * arrivals still converge to the same final sequence on every peer.
 */
export function applyReplicatedOperation(env: ReplicationEnvelope): void {
  clock.receive(env.lamportTime);
  const { op } = env;
  if (op.kind !== "timer") {
    reportEvent({
      kind: "replicate-in",
      from: env.originPeerId,
      to: peerRegistry.selfId(),
      auctionId: (op as any).auctionId ?? (op as any).auction?.id,
      detail: op.kind,
    });
  }
  switch (op.kind) {
    case "auction": {
      // Initial creation broadcast — overwrite if our copy is older.
      const existing = store.get(op.auction.id);
      if (!existing || existing.lamportTime < op.auction.lamportTime) {
        store.upsert(op.auction);
      }
      break;
    }
    case "bid": {
      const a = store.get(op.auctionId);
      if (!a) break;
      // Insert in sorted position (sequential consistency).
      a.bids.push(op.bid);
      const key = (x: Bid) => ({ lamportTime: x.lamportTime, peerId: x.originPeerId });
      a.bids.sort((x, y) => lamportCompare(key(x), key(y)));
      // Highest bid is the maximum amount; ties broken by Lamport order.
      let highest = a.bids[0];
      for (const b of a.bids) {
        if (
          b.amount > highest.amount ||
          (b.amount === highest.amount && lamportCompare(key(b), key(highest)) < 0)
        )
          highest = b;
      }
      a.highestBid = highest;
      a.lamportTime = Math.max(a.lamportTime, op.bid.lamportTime);
      break;
    }
    case "status": {
      const a = store.get(op.auctionId);
      if (!a) break;
      a.status = op.status;
      if (op.endsAt) a.endsAt = op.endsAt;
      if (op.status === "ACTIVE" && !a.startedAt) a.startedAt = Date.now();
      a.lamportTime = Math.max(a.lamportTime, env.lamportTime);
      break;
    }
    case "timer": {
      const a = store.get(op.auctionId);
      if (!a) break;
      a.endsAt = Date.now() + op.timeRemaining * 1000;
      break;
    }
    case "participant": {
      const a = store.get(op.auctionId);
      if (!a) break;
      if (!a.participantNames) a.participantNames = {};
      if (op.action === "join") {
        if (!a.participants.includes(op.userId)) a.participants.push(op.userId);
        if (op.userName) a.participantNames[op.userId] = op.userName;
      } else {
        a.participants = a.participants.filter((u) => u !== op.userId);
      }
      a.lamportTime = Math.max(a.lamportTime, env.lamportTime);
      break;
    }
    case "winner": {
      const a = store.get(op.auctionId);
      if (!a) break;
      a.winner = { userId: op.userId, amount: op.amount };
      a.status = "ENDED";
      a.lamportTime = Math.max(a.lamportTime, env.lamportTime);
      break;
    }
  }
  emit(op);
}
