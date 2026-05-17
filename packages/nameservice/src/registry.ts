// ═══════════════════════════════════════════════════════
// File: registry.ts
// Role: In-memory peer registry maintained by the NameService.
// ═══════════════════════════════════════════════════════
// DISTRIBUTED SYSTEMS CONCEPT: Name Service / Service Discovery
// Problem: In a hybrid P2P architecture, peers must locate one another
//          dynamically as they join and leave; clients must locate a
//          live peer to serve them. Hard-coding addresses defeats
//          scalability and fault tolerance.
// Solution: A central directory (NameService) maintains a logical-to-
//          physical mapping (peerId → URL) refreshed by heartbeats.
// In this system: All peers register here on boot; the frontend asks
//          the NameService which peer should serve each auction.
// Trade-offs: Introduces a single logical point of contact — but the
//          registry itself is stateless beyond live registrations and
//          can be replicated trivially. Peers cache their local copy.
// ═══════════════════════════════════════════════════════

export type PeerStatus = "ACTIVE" | "FAILED";

export interface PeerInfo {
  peerId: string;
  url: string;
  capacity: number;
  load: number;          // active auctions hosted as coordinator
  auctionCount: number;
  lastHeartbeat: number; // epoch ms
  status: PeerStatus;
  registeredAt: number;
  lamportTime: number;   // last reported Lamport time
  quarantineUntil?: number; // epoch ms; ignore revive heartbeats until then
}

class PeerRegistry {
  private peers = new Map<string, PeerInfo>();

  register(peerId: string, url: string, capacity = 100): PeerInfo {
    const now = Date.now();
    const existing = this.peers.get(peerId);
    const info: PeerInfo = {
      peerId,
      url,
      capacity,
      load: existing?.load ?? 0,
      auctionCount: existing?.auctionCount ?? 0,
      lastHeartbeat: now,
      status: "ACTIVE",
      registeredAt: existing?.registeredAt ?? now,
      lamportTime: existing?.lamportTime ?? 0,
    };
    this.peers.set(peerId, info);
    return info;
  }

  deregister(peerId: string): boolean {
    return this.peers.delete(peerId);
  }

  // Returns { known, revived }. revived = true when the peer transitioned
  // from FAILED back to ACTIVE — caller should signal the peer to re-sync
  // its state from a sibling since it may have missed updates while down.
  heartbeat(
    peerId: string,
    load: number,
    auctionCount: number,
    lamportTime: number
  ): { known: boolean; revived: boolean; quarantined: boolean } {
    const p = this.peers.get(peerId);
    if (!p) return { known: false, revived: false, quarantined: false };
    const now = Date.now();
    // If the peer is quarantined (recently soft-crashed), accept the
    // heartbeat for liveness tracking but keep it FAILED until the
    // quarantine window expires. This makes the failure visible on /cluster
    // for several seconds instead of healing instantly.
    if (p.quarantineUntil && now < p.quarantineUntil) {
      p.lastHeartbeat = now;
      p.load = load;
      p.auctionCount = auctionCount;
      p.lamportTime = lamportTime;
      return { known: true, revived: false, quarantined: true };
    }
    const wasFailed = p.status === "FAILED";
    p.lastHeartbeat = now;
    p.load = load;
    p.auctionCount = auctionCount;
    p.lamportTime = lamportTime;
    p.status = "ACTIVE";
    p.quarantineUntil = undefined;
    return { known: true, revived: wasFailed, quarantined: false };
  }

  markFailed(peerId: string, quarantineMs = 0): void {
    const p = this.peers.get(peerId);
    if (!p) return;
    p.status = "FAILED";
    if (quarantineMs > 0) p.quarantineUntil = Date.now() + quarantineMs;
  }

  getActivePeers(): PeerInfo[] {
    return [...this.peers.values()].filter((p) => p.status === "ACTIVE");
  }

  getAllPeers(): PeerInfo[] {
    return [...this.peers.values()];
  }

  get(peerId: string): PeerInfo | undefined {
    return this.peers.get(peerId);
  }

  // Load-balanced assignment: choose ACTIVE peer with fewest auctions.
  // Ties broken deterministically by peerId for predictability.
  assignLeastLoaded(): PeerInfo | undefined {
    const active = this.getActivePeers();
    if (active.length === 0) return undefined;
    return active.sort((a, b) => {
      if (a.auctionCount !== b.auctionCount) return a.auctionCount - b.auctionCount;
      return a.peerId.localeCompare(b.peerId);
    })[0];
  }
}

export const registry = new PeerRegistry();
