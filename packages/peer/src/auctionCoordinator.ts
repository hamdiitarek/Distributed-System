// ═══════════════════════════════════════════════════════
// File: auctionCoordinator.ts
// Role: Manages the lifecycle of an auction (PENDING → ACTIVE → ENDED)
//       and handles coordinator re-election on peer failure.
// ═══════════════════════════════════════════════════════
// DISTRIBUTED SYSTEMS CONCEPT: Coordinator Election + Lifecycle
// ═══════════════════════════════════════════════════════
// Problem: One peer must drive the timer and decide auction transitions.
//          If that peer dies mid-auction the system must elect a new
//          one — deterministically, so no two replicas disagree.
//
// Solution:
//   • Initial coordinator = the peer assigned by NameService on
//     auction creation (least-loaded).
//   • On peer failure: every surviving peer applies the same rule —
//     "the surviving peer with the lowest peerId (lex) takes over
//     for each auction whose coordinator was the failed peer."
//     Because all peers see the same failure notification and use the
//     same deterministic rule, they all elect the same new coordinator
//     without exchanging extra messages.
//
// In this system: Only the coordinator ticks the timer and broadcasts
//   "timer" replication ops. Bid acceptance happens on *any* peer, but
//   status transitions go through Ricart–Agrawala plus replication.
//
// Trade-offs: Lowest-id election is simple but unfair under repeated
//   failures (peer-1 keeps getting work). For an auction app this is
//   fine; production systems would use Raft/ZAB for stronger semantics.
// ═══════════════════════════════════════════════════════

import { Server as IOServer } from "socket.io";
import { clock } from "./lamportClock";
import { peerRegistry } from "./peerRegistry";
import { ricartAgrawala } from "./ricartAgrawala";
import { broadcastToAllPeers, onReplicatedOp } from "./replication";
import { store, Auction, Bid } from "./store";
import { reportEvent } from "./clusterEvents";
import { pushHeartbeat } from "./heartbeat";

let io: IOServer | null = null;
export function attachIO(s: IOServer) {
  io = s;
}

const timers = new Map<string, NodeJS.Timeout>();

function emitClient(event: string, payload: any) {
  io?.emit(event, payload);
}

function emitAuction(auctionId: string, event: string, payload: any) {
  io?.to(`auction:${auctionId}`).emit(event, payload);
}

/** Create a new auction; only invoked on the assigned coordinator peer. */
export async function createAuction(input: {
  title: string;
  description: string;
  startingBid: number;
  reservePrice: number;
  minParticipants: number;
  durationSeconds: number;
}): Promise<Auction> {
  const id = `auc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const lamportTime = clock.tick();
  const auction: Auction = {
    id,
    title: input.title,
    description: input.description,
    startingBid: input.startingBid,
    reservePrice: input.reservePrice,
    minParticipants: Math.max(1, input.minParticipants),
    durationSeconds: input.durationSeconds,
    status: "PENDING",
    coordinatorPeerId: peerRegistry.selfId(),
    createdAt: Date.now(),
    participants: [],
    participantNames: {},
    bids: [],
    lamportTime,
  };
  store.upsert(auction);
  await broadcastToAllPeers({ kind: "auction", auction });
  emitClient("auction:created", auction);
  pushHeartbeat();
  return auction;
}

/** Place a bid. The CRITICAL SECTION of the system. */
export async function placeBid(input: {
  auctionId: string;
  userId: string;
  userName?: string;
  amount: number;
}): Promise<{ ok: true; bid: Bid } | { ok: false; reason: string }> {
  const a = store.get(input.auctionId);
  if (!a) return { ok: false, reason: "auction not found" };
  if (a.status !== "ACTIVE") return { ok: false, reason: `auction is ${a.status}` };
  const currentMax = a.highestBid?.amount ?? a.startingBid;
  if (input.amount <= currentMax)
    return { ok: false, reason: `bid must exceed current ${currentMax}` };

  // ─── Critical section: only one peer at a time may commit a bid ───
  const release = await ricartAgrawala.acquire(`auction:${a.id}`);
  try {
    // Re-check inside the CS (another peer might have raised the bid).
    const fresh = store.get(input.auctionId);
    if (!fresh) return { ok: false, reason: "auction vanished" };
    const max = fresh.highestBid?.amount ?? fresh.startingBid;
    if (input.amount <= max) return { ok: false, reason: `bid must exceed current ${max}` };

    const lamportTime = clock.tick();
    const bid: Bid = {
      bidId: `bid_${lamportTime}_${peerRegistry.selfId()}`,
      auctionId: fresh.id,
      userId: input.userId,
      userName: input.userName,
      amount: input.amount,
      lamportTime,
      originPeerId: peerRegistry.selfId(),
      wallClock: Date.now(),
    };

    // Apply locally first.
    fresh.bids.push(bid);
    fresh.highestBid = bid;
    fresh.lamportTime = lamportTime;

    reportEvent({
      kind: "bid",
      from: peerRegistry.selfId(),
      auctionId: fresh.id,
      detail: `$${bid.amount}`,
    });

    // Replicate to all other peers (active replication).
    await broadcastToAllPeers({ kind: "bid", auctionId: fresh.id, bid });

    emitAuction(fresh.id, "auction:bid_update", {
      newBid: bid,
      highestBid: bid,
      lamportTime,
      peerId: peerRegistry.selfId(),
    });

    pushHeartbeat();
    return { ok: true, bid };
  } finally {
    await release();
  }
}

export async function addParticipant(
  auctionId: string,
  userId: string,
  userName?: string
): Promise<void> {
  const a = store.get(auctionId);
  if (!a) return;
  if (!a.participants.includes(userId)) a.participants.push(userId);
  if (!a.participantNames) a.participantNames = {};
  if (userName) a.participantNames[userId] = userName;
  await broadcastToAllPeers({
    kind: "participant",
    auctionId,
    userId,
    userName,
    action: "join",
  });
  emitAuction(auctionId, "auction:state", publicView(a));

  // Auto-start on quorum: only the coordinator drives the transition.
  if (
    a.status === "PENDING" &&
    a.participants.length >= a.minParticipants &&
    a.coordinatorPeerId === peerRegistry.selfId()
  ) {
    await startAuction(auctionId);
  }
}

export async function removeParticipant(auctionId: string, userId: string): Promise<void> {
  const a = store.get(auctionId);
  if (!a) return;
  a.participants = a.participants.filter((u) => u !== userId);
  await broadcastToAllPeers({
    kind: "participant",
    auctionId,
    userId,
    action: "leave",
  });
  emitAuction(auctionId, "auction:state", publicView(a));
}

// Re-check quorum whenever a participant join is REPLICATED to us, not just
// when a user happens to be connected to the coordinator's Socket.IO server.
// Without this, a third bidder connecting to a non-coordinator peer would
// never trigger PENDING → ACTIVE.
onReplicatedOp((op) => {
  if (op.kind !== "participant" || op.action !== "join") return;
  const a = store.get(op.auctionId);
  if (!a) return;
  if (
    a.status === "PENDING" &&
    a.participants.length >= a.minParticipants &&
    a.coordinatorPeerId === peerRegistry.selfId()
  ) {
    startAuction(op.auctionId).catch((err) =>
      // eslint-disable-next-line no-console
      console.warn(`[coordinator] auto-start failed for ${op.auctionId}:`, err)
    );
  }
});

// Re-emit important state transitions to THIS peer's connected WS clients
// when the op was authored elsewhere. Without this, only clients attached
// to the coordinator's Socket.IO server see the PENDING → ACTIVE flip and
// the auction-ended overlay, so other users have to refresh.
onReplicatedOp((op) => {
  if (op.kind === "bid") {
    const a = store.get(op.auctionId);
    if (!a) return;
    emitAuction(op.auctionId, "auction:bid_update", {
      newBid: op.bid,
      highestBid: a.highestBid,
      lamportTime: a.lamportTime,
      peerId: peerRegistry.selfId(),
    });
  } else if (op.kind === "status") {
    const a = store.get(op.auctionId);
    if (!a) return;
    if (op.status === "ACTIVE") {
      const timeRemaining = op.endsAt
        ? Math.max(0, Math.floor((op.endsAt - Date.now()) / 1000))
        : a.durationSeconds;
      emitAuction(op.auctionId, "auction:timer", {
        timeRemaining,
        status: "ACTIVE",
      });
    } else if (op.status === "ENDED") {
      emitAuction(op.auctionId, "auction:ended", {
        winner: a.winner ?? null,
        finalAmount: a.winner?.amount ?? null,
        bidHistory: a.bids,
      });
    }
  } else if (op.kind === "winner") {
    const a = store.get(op.auctionId);
    if (!a) return;
    emitAuction(op.auctionId, "auction:ended", {
      winner: a.winner ?? null,
      finalAmount: a.winner?.amount ?? null,
      bidHistory: a.bids,
    });
  } else if (op.kind === "participant") {
    const a = store.get(op.auctionId);
    if (!a) return;
    // Keep the participants sidebar in sync on non-coordinator peers.
    emitAuction(op.auctionId, "auction:state", publicView(a));
  }
});

async function startAuction(auctionId: string): Promise<void> {
  const a = store.get(auctionId);
  if (!a || a.status !== "PENDING") return;
  const release = await ricartAgrawala.acquire(`auction:${auctionId}`);
  try {
    a.status = "ACTIVE";
    a.startedAt = Date.now();
    a.endsAt = Date.now() + a.durationSeconds * 1000;
    a.lamportTime = clock.tick();
    await broadcastToAllPeers({
      kind: "status",
      auctionId,
      status: "ACTIVE",
      endsAt: a.endsAt,
    });
    emitAuction(auctionId, "auction:timer", {
      timeRemaining: a.durationSeconds,
      status: "ACTIVE",
    });
    startTimer(auctionId);
  } finally {
    await release();
  }
}

function startTimer(auctionId: string) {
  if (timers.has(auctionId)) return;
  const handle = setInterval(async () => {
    const a = store.get(auctionId);
    if (!a || !a.endsAt) {
      clearInterval(handle);
      timers.delete(auctionId);
      return;
    }
    const remaining = Math.max(0, Math.floor((a.endsAt - Date.now()) / 1000));
    emitAuction(auctionId, "auction:timer", { timeRemaining: remaining, status: a.status });
    // Replicate tick (eventual consistency — drift tolerated).
    broadcastToAllPeers({ kind: "timer", auctionId, timeRemaining: remaining }).catch(() => undefined);
    if (remaining === 0) {
      clearInterval(handle);
      timers.delete(auctionId);
      await endAuction(auctionId);
    }
  }, 1000);
  timers.set(auctionId, handle);
}

async function endAuction(auctionId: string): Promise<void> {
  const a = store.get(auctionId);
  if (!a || a.status === "ENDED") return;
  const release = await ricartAgrawala.acquire(`auction:${auctionId}`);
  try {
    const highest = a.highestBid;
    const reserveMet = highest && highest.amount >= a.reservePrice;
    a.status = "ENDED";
    a.lamportTime = clock.tick();
    if (reserveMet && highest) {
      a.winner = { userId: highest.userId, amount: highest.amount };
      await broadcastToAllPeers({
        kind: "winner",
        auctionId,
        userId: highest.userId,
        amount: highest.amount,
      });
    } else {
      await broadcastToAllPeers({ kind: "status", auctionId, status: "ENDED" });
    }
    emitAuction(auctionId, "auction:ended", {
      winner: a.winner ?? null,
      finalAmount: a.winner?.amount ?? null,
      bidHistory: a.bids,
    });
    pushHeartbeat();
  } finally {
    await release();
  }
}

/**
 * Called when the NameService informs us that a peer has died.
 * Every surviving peer runs this with the same input and applies
 * the deterministic lowest-id election rule.
 */
export function onPeerFailed(failedPeerId: string): void {
  ricartAgrawala.onPeerFailed(failedPeerId);
  peerRegistry.remove(failedPeerId);

  reportEvent({
    kind: "peer-failed",
    from: peerRegistry.selfId(),
    detail: `survivor noticed ${failedPeerId}`,
  });

  const survivors = [peerRegistry.selfId(), ...peerRegistry.others().map((p) => p.peerId)].sort();
  const newCoordinator = survivors[0];

  for (const a of store.snapshot()) {
    if (a.coordinatorPeerId === failedPeerId && a.status !== "ENDED") {
      a.coordinatorPeerId = newCoordinator;
      reportEvent({
        kind: "elect",
        from: peerRegistry.selfId(),
        to: newCoordinator,
        auctionId: a.id,
        detail: `${failedPeerId} → ${newCoordinator}`,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[coordinator] auction ${a.id}: coordinator ${failedPeerId} failed → elected ${newCoordinator}`
      );
      if (newCoordinator === peerRegistry.selfId() && a.status === "ACTIVE") {
        startTimer(a.id);
      }
    }
  }
}

function publicView(a: Auction) {
  return {
    auction: a,
    participants: a.participants,
    bids: a.bids,
    timeRemaining: a.endsAt ? Math.max(0, Math.floor((a.endsAt - Date.now()) / 1000)) : 0,
  };
}

export function getPublicView(auctionId: string) {
  const a = store.get(auctionId);
  if (!a) return null;
  return publicView(a);
}

/** On reboot, restart timers for auctions we now coordinate. */
export function restartCoordinatorTimers(): void {
  for (const a of store.snapshot()) {
    if (a.coordinatorPeerId === peerRegistry.selfId() && a.status === "ACTIVE") {
      startTimer(a.id);
    }
  }
}
