# System Architecture

The proposed project must include a well-defined system architecture diagram that accurately represents the roles of components (clients, servers/peers, middleware, name service) and the communication flows between them.

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Clients["Client Layer"]
        WEB["Next.js Frontend<br/>(Browser, port 3000)"]
        APPW["Appwrite<br/>(Auth / User Store)"]
    end

    subgraph Middleware["Middleware Layer"]
        ORB["ORB Layer<br/>(REST via Axios + Socket.IO)"]
        LC["Lamport Clock<br/>(Logical Ordering)"]
        RA["Ricart–Agrawala<br/>(Mutual Exclusion)"]
    end

    subgraph NameService["Name Service (port 3001)"]
        REG["Peer Registry"]
        HM["Health Monitor<br/>(Heartbeat Tracker)"]
        EV["Events Stream"]
    end

    subgraph Peers["Server / Peer Layer"]
        P1["Peer 1 (4001)<br/>Coordinator?<br/>Auction State"]
        P2["Peer 2 (4002)<br/>Auction State"]
        P3["Peer 3 (4003)<br/>Auction State"]
    end

    WEB -- "Auth (SDK)" --> APPW
    WEB -- "Discover Peers (REST)" --> REG
    WEB -- "Bids / Events (Socket.IO)" --> P1
    WEB -- "Bids / Events (Socket.IO)" --> P2
    WEB -- "Bids / Events (Socket.IO)" --> P3

    P1 -- "Register + Heartbeat" --> REG
    P2 -- "Register + Heartbeat" --> REG
    P3 -- "Register + Heartbeat" --> REG
    HM -- "Detect Failure" --> REG
    REG -- "Peer Up/Down" --> EV
    EV -- "Cluster Events (Socket.IO)" --> P1
    EV -- "Cluster Events (Socket.IO)" --> P2
    EV -- "Cluster Events (Socket.IO)" --> P3

    P1 <-- "State Replication (ORB/REST)" --> P2
    P2 <-- "State Replication (ORB/REST)" --> P3
    P1 <-- "State Replication (ORB/REST)" --> P3

    P1 <-- "RA Request / Reply / Release" --> P2
    P2 <-- "RA Request / Reply / Release" --> P3
    P1 <-- "RA Request / Reply / Release" --> P3

    ORB -. used by .-> P1
    ORB -. used by .-> P2
    ORB -. used by .-> P3
    LC -. stamps msgs .-> P1
    LC -. stamps msgs .-> P2
    LC -. stamps msgs .-> P3
    RA -. coordinates .-> P1
    RA -. coordinates .-> P2
    RA -. coordinates .-> P3
```

## Component Roles

- **Next.js Frontend (`packages/frontend`)** — Browser client (port 3000). Authenticates users through Appwrite, discovers live peers from the Name Service, and opens a Socket.IO connection to a peer to place bids and receive auction updates in real time.
- **Appwrite** — External auth provider and user store used by the frontend SDK (`lib/appwrite.ts`, `lib/auth-context.tsx`).
- **Name Service (`packages/nameservice`, port 3001)** — Central directory of live peers. Holds the peer **registry**, runs a **health monitor** that expires peers missing heartbeats, and emits cluster **events** (peer up/down) to subscribed peers and clients.
- **Peers (`packages/peer`, ports 4001–4003)** — Symmetric application servers that hold the replicated auction state. Each peer:
  - Registers with the Name Service and sends periodic heartbeats (`heartbeat.ts`).
  - Runs an **auction coordinator** (`auctionCoordinator.ts`) — one elected peer drives auction lifecycle.
  - Replicates state to other peers (`replication.ts`, `stateSync.ts`).
  - Serializes critical sections with **Ricart–Agrawala** mutual exclusion (`ricartAgrawala.ts`) using **Lamport clocks** (`lamportClock.ts`).
- **Middleware (in-process, per peer)**:
  - **ORB layer** (`orb.ts`, frontend `lib/orb-client.ts`) — REST/Socket.IO abstraction for remote invocation between peers and from clients.
  - **Lamport clock** — Logical timestamps on every outgoing message.
  - **Ricart–Agrawala** — Distributed mutual exclusion before mutating shared auction state.

## Communication Flows

1. **Client → Appwrite:** Authenticate user, retrieve session.
2. **Client → Name Service (REST):** Fetch the list of live peers.
3. **Client → Peer (Socket.IO):** Subscribe to auction events; submit bids.
4. **Peer → Name Service (REST):** Register on startup; send periodic heartbeats.
5. **Name Service → Peers/Clients (Socket.IO events):** Broadcast `peer-up` / `peer-down` cluster changes.
6. **Peer ↔ Peer (ORB/REST):** State replication and synchronization of the auction store.
7. **Peer ↔ Peer (RA messages):** `REQUEST` / `REPLY` / `RELEASE` for mutual exclusion, stamped with Lamport timestamps.
8. **Coordinator Peer → Peers:** Drives auction lifecycle (start, close, declare winner) and propagates results.
