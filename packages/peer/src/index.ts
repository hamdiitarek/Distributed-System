// ═══════════════════════════════════════════════════════
// File: peer/index.ts
// Role: Boot a single peer process.
//   1. Start Express + Socket.IO.
//   2. Register with the NameService.
//   3. Sync state from any existing peer.
//   4. Begin heartbeats + periodic peer-list refresh.
//   5. Handle graceful shutdown.
// ═══════════════════════════════════════════════════════
import express from "express";
import http from "http";
import cors from "cors";
import axios from "axios";
import { Server as IOServer } from "socket.io";

import auctions from "./routes/auctions";
import bids from "./routes/bids";
import replicate from "./routes/replicate";
import peerJoin from "./routes/peerJoin";
import health from "./routes/health";

import { peerRegistry } from "./peerRegistry";
import { clock } from "./lamportClock";
import { store } from "./store";
import { pushHeartbeat } from "./heartbeat";
import { syncStateFromAnyPeer } from "./stateSync";
import {
  attachIO,
  addParticipant,
  removeParticipant,
  placeBid,
  restartCoordinatorTimers,
  getPublicView,
} from "./auctionCoordinator";

const PORT = Number(process.env.PORT ?? 4001);
const PEER_ID = peerRegistry.selfId();
const NS = peerRegistry.nameServiceUrl();
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

async function registerWithNameService() {
  for (let i = 0; i < 10; i++) {
    try {
      const { data } = await axios.post(
        `${NS}/register`,
        { peerId: PEER_ID, url: PUBLIC_URL, capacity: 100 },
        { timeout: 5000 }
      );
      peerRegistry.setAll(
        (data.currentPeers ?? []).map((p: any) => ({ peerId: p.peerId, url: p.url }))
      );
      // eslint-disable-next-line no-console
      console.log(`[peer ${PEER_ID}] registered. Active peers: ${peerRegistry.all().length}`);
      return;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn(`[peer ${PEER_ID}] register attempt ${i + 1} failed: ${err?.message ?? err}`);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw new Error("Could not contact NameService after 10 attempts");
}

async function heartbeatLoop() {
  pushHeartbeat();
  setInterval(pushHeartbeat, 2000);
}

async function refreshPeersLoop() {
  setInterval(() => peerRegistry.refreshFromNameService(), 10_000);
}

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.use(auctions);
  app.use(bids);
  app.use(replicate);
  app.use(peerJoin);
  app.use(health);

  const server = http.createServer(app);
  const io = new IOServer(server, { cors: { origin: "*" } });
  attachIO(io);

  io.on("connection", (socket) => {
    // eslint-disable-next-line no-console
    console.log(`[ws ${PEER_ID}] client connected ${socket.id}`);
    socket.emit("peer:info", {
      servingPeerId: PEER_ID,
      replicaCount: peerRegistry.all().length,
      lamportTime: clock.getTime(),
    });

    socket.on("auction:join", async ({ auctionId, userId, userName }) => {
      if (!auctionId || !userId) return;
      socket.join(`auction:${auctionId}`);
      await addParticipant(auctionId, userId, userName);
      const view = getPublicView(auctionId);
      if (view) socket.emit("auction:state", view);
    });

    socket.on("auction:leave", async ({ auctionId, userId }) => {
      if (!auctionId || !userId) return;
      socket.leave(`auction:${auctionId}`);
      await removeParticipant(auctionId, userId);
    });

    socket.on("auction:bid", async ({ auctionId, userId, userName, amount }) => {
      const r = await placeBid({ auctionId, userId, userName, amount });
      if (!r.ok) socket.emit("auction:error", { code: "BID_REJECTED", message: r.reason });
    });
  });

  server.listen(PORT, async () => {
    // eslint-disable-next-line no-console
    console.log(`[peer ${PEER_ID}] HTTP+WS on :${PORT}  public=${PUBLIC_URL}  Lamport=0`);
    await registerWithNameService();
    await syncStateFromAnyPeer();
    restartCoordinatorTimers();
    heartbeatLoop();
    refreshPeersLoop();
  });

  // ── Graceful shutdown ──
  const shutdown = async (sig: string) => {
    // eslint-disable-next-line no-console
    console.log(`[peer ${PEER_ID}] ${sig} — deregistering`);
    try {
      await axios.post(`${NS}/deregister`, { peerId: PEER_ID }, { timeout: 3000 });
    } catch {
      /* ignore */
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[peer] fatal", err);
  process.exit(1);
});
