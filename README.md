# Distributed Real-Time Auction System

**CSE463 — Distributed Systems · Course Project**

A hybrid peer-to-peer + client-server real-time auction platform that demonstrates:

- **Object Request Broker (ORB)** middleware (CORBA-style location transparency)
- **Name Service** for peer/service discovery
- **Lamport logical clocks** for total ordering of events
- **Ricart–Agrawala** distributed mutual exclusion
- **Active replication** across ≥ 3 peer nodes
- **Sequential consistency** model
- **Heartbeat-based failure detection** + automatic recovery
- **Peer lifecycle management** (register, deregister, state sync on join)
- Coordinator re-election under failure (deterministic lowest-id rule)

> Users are **not** peers. Peers are internal distributed backend services
> invisible to users. Browsers always contact `auction.yourdomain.com` only.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│         CLIENT LAYER (Browser)              │
│    auction.yourdomain.com  (Next.js 15)     │
│    - Appwrite Auth / DB                     │
│    - Socket.IO client                       │
└──────────────────┬──────────────────────────┘
                   │ HTTPS / WebSocket
┌──────────────────▼──────────────────────────┐
│         MIDDLEWARE LAYER                    │
│   Object Request Broker (ORB)               │
│   - Abstracts all remote peer calls         │
│   - Routes to NameService                   │
│   - Handles retries and failover            │
└──────────────────┬──────────────────────────┘
                   │ Internal TCP/JSON
       ┌───────────┼───────────┐
       ▼           ▼           ▼
  ┌─────────┐ ┌─────────┐ ┌─────────┐
  │  Peer 1 │ │  Peer 2 │ │  Peer 3 │
  │ Lamport │ │Lamport  │ │ Lamport │
  │R-A Mutex│ │R-A Mutex│ │R-A Mutex│
  └─────────┘ └─────────┘ └─────────┘
       │           │           │
       └─────┬─────┘           │
             │   Peer-to-Peer  │
             │   Replication   │
       ┌─────▼───────────────┐
       │     NameService      │
       └─────────────────────┘
```

---

## System Component Specification

| Component Name | Type | Protocol | Description |
|---|---|---|---|
| NameService | Service | HTTP/JSON over TCP | Global peer registry; address known to all peers and frontend |
| ObjectRequestBroker | Middleware | JSON/TCP | Abstracts remote peer invocations; handles routing, retries, failover |
| PeerRegistry (local) | Module | N/A | Each peer's local copy of active peers list; refreshed from NameService |
| LamportClock | Module | N/A | Logical clock for total ordering of bids across all distributed peers |
| RicartAgrawala | Mutex | Permission-based JSON/TCP | Distributed mutual exclusion for critical sections (bid writes, status updates) |
| AuctionCoordinator | Service | JSON/TCP + Socket.IO | Manages auction lifecycle; coordinates timer, auto-start, end conditions |
| ReplicationManager | Module | HTTP/JSON | Broadcasts write operations to all replica peers using active replication |
| StateSyncManager | Module | HTTP/JSON | Transfers full auction state to newly joined peers |
| HealthMonitor | Service | HTTP | Detects peer failures via heartbeat timeouts; triggers `peer:failed` events |
| Socket.IO Gateway | Gateway | WebSocket | Real-time event delivery from peers to browser clients |
| AppwriteAdapter | Module | HTTPS/REST | Persists completed auction results; manages user auth tokens |

---

## Replication and Consistency Specification

| Operation | Replica Manager | Lock Required | Propagation | Consistency Model |
|---|---|---|---|---|
| Place bid | All peers (broadcast) | Yes — Ricart–Agrawala mutex per auction | Broadcast `replicate/bid` with Lamport timestamp | Sequential consistency |
| Read auction state | Any peer (load-balanced via NameService) | No | None | Sequential (reads from fully replicated state) |
| Update auction status | All peers (broadcast) | Yes — Ricart–Agrawala mutex | Broadcast `replicate/status` | Sequential consistency |
| Timer tick | Coordinator peer | No | Broadcast `replicate/timer` every second | Eventual (timer drift tolerated) |
| Participant join/leave | All peers (broadcast) | No | Broadcast `replicate/participant` | Eventual consistency |
| Peer join | Joining peer | Yes — state transfer lock | Full state transfer from any existing peer | State synchronization |
| Peer leave (graceful) | Remaining peers | Token redistribution | `deregister` + notify peers via NameService | Graceful degradation |
| Peer failure | Remaining peers | Token regeneration by new coordinator | NameService broadcasts `peer:failed`; peers prune locally | Fault tolerance |
| Auction creation | Assigned coordinator peer | No | Replicate initial state to all peers | Sequential consistency |
| Auction end / winner | All peers (broadcast) | Yes — final write lock | Broadcast result + persist to Appwrite | Strong / Sequential |

---

## Repository Layout

```
distributed-auction/
├── packages/
│   ├── nameservice/   # Peer registry, health monitor, /assign-peer, heartbeat
│   ├── peer/          # Distributed peer (Lamport + R-A + replication + ORB)
│   └── frontend/      # Next.js 15 client + API proxy
├── docker-compose.yml # Local dev: NameService + 3 peers
├── render.yaml        # Render deployment (NameService + 3 peers)
└── README.md
```

Inside each peer:
- `lamportClock.ts` — logical clock
- `ricartAgrawala.ts` — distributed mutex
- `orb.ts` — Object Request Broker
- `replication.ts` — active replication + apply-in-order
- `stateSync.ts` — full snapshot transfer on join
- `auctionCoordinator.ts` — lifecycle, coordinator election, timer
- `peerRegistry.ts` — local cached view of active peers
- `routes/` — Express routes (auctions, bids, replicate, RA, internal)

---

## Local Development

### Option A — Docker Compose (recommended)

```bash
docker compose up --build
# NameService → http://localhost:3001
# Peer 1      → http://localhost:4001
# Peer 2      → http://localhost:4002
# Peer 3      → http://localhost:4003
```

Then run the frontend in another terminal:

```bash
cd packages/frontend
cp .env.example .env.local   # fill in Appwrite project id
npm install
npm run dev
# → http://localhost:3000
```

### Option B — Without Docker

```bash
npm install --workspaces

# Terminal 1
npm run dev:ns

# Terminals 2-4 (peers)
npm run dev:peer1
npm run dev:peer2
npm run dev:peer3

# Terminal 5
npm run dev:web
```

---

## Deployment

### Frontend → Vercel

Push `packages/frontend` to a Vercel project. Environment variables:

```
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=<your-project-id>
NAMESERVICE_URL=https://nameservice.onrender.com
NEXT_PUBLIC_APP_URL=https://auction.yourdomain.com
```

### Peers + NameService → Render

`render.yaml` declares four Web Services. After first deploy, fill in the
`NAME_SERVICE_URL` and `PUBLIC_URL` env vars in each peer service so they
can reach the NameService and announce their public address.

### Appwrite Collections

```
users            (managed by Appwrite Auth)
auction_results  { auctionId, winnerId, finalBid, endedAt, bidCount }
```

---

## Socket.IO Events

**Client → Server**

| Event | Payload |
|---|---|
| `auction:join`  | `{ auctionId, userId, jwtToken }` |
| `auction:bid`   | `{ auctionId, userId, amount, jwtToken }` |
| `auction:leave` | `{ auctionId, userId }` |

**Server → Client**

| Event | Payload |
|---|---|
| `auction:state`      | `{ auction, participants, bids, timeRemaining }` |
| `auction:bid_update` | `{ newBid, highestBid, lamportTime, peerId }` |
| `auction:timer`      | `{ timeRemaining, status }` |
| `auction:ended`      | `{ winner, finalAmount, bidHistory }` |
| `auction:error`      | `{ code, message }` |
| `peer:info`          | `{ servingPeerId, replicaCount }` |

**Peer → Peer (internal HTTP)**

| Path | Body |
|---|---|
| `POST /replicate/bid`         | `{ op, lamportTime, originPeerId }` |
| `POST /replicate/status`      | `{ op, lamportTime, originPeerId }` |
| `POST /replicate/timer`       | `{ op, lamportTime, originPeerId }` |
| `POST /replicate/participant` | `{ op, lamportTime, originPeerId }` |
| `POST /ra/request`            | `{ resourceId, ts, peerId }` |
| `POST /ra/reply`              | `{ resourceId, ts, peerId }` |

---

## Demonstration Test Scenarios

1. **Concurrent bid** — two users post the same amount at the same instant on
   different peers. Verify both peers converge to the same winner via
   `(lamportTime, peerId)` total ordering.

2. **Peer join mid-auction** — start an auction with 2 peers, then bring up
   peer-3. Confirm peer-3 receives full state and shows correct bid history
   on `/peer/state`.

3. **Peer failure** — `curl -X POST http://localhost:4002/admin/kill`
   while an auction is active. Within ≤ 15 s the NameService marks peer-2
   `FAILED`, surviving peers prune it from local registries, and a new
   coordinator is elected by lowest-id rule.

4. **Ricart–Agrawala correctness** — drive 10 concurrent bids from three
   peers. All peers must agree on final order; counts in `bids` are equal.

5. **Auto-start** — create an auction with `minParticipants=3`. Join with
   2 users (stays PENDING). Join the 3rd; coordinator transitions to
   ACTIVE and broadcasts the timer.

---

## Distributed Systems Concepts in the Code

Every concept is annotated in source with a comment block:

```
// ═══════════════════════════════════════════════════════
// DISTRIBUTED SYSTEMS CONCEPT: [Concept Name]
// ═══════════════════════════════════════════════════════
// Problem: ...
// Solution: ...
// In this system: ...
// Trade-offs: ...
// ═══════════════════════════════════════════════════════
```

Annotated files:
- `packages/peer/src/lamportClock.ts`
- `packages/peer/src/ricartAgrawala.ts`
- `packages/peer/src/orb.ts`
- `packages/peer/src/replication.ts`
- `packages/peer/src/stateSync.ts`
- `packages/peer/src/auctionCoordinator.ts`
- `packages/nameservice/src/registry.ts`
- `packages/nameservice/src/healthMonitor.ts`

---

## Fault-Tolerance Demonstration Endpoint

Development-only: every peer exposes

```
POST http://localhost:400N/admin/kill
```

to simulate a hard crash without graceful shutdown — useful for the
demonstration video. Disabled in production unless `ALLOW_KILL=1`.

---

## License

Academic use — CSE463 course project.
