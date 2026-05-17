// ═══════════════════════════════════════════════════════
// File: store.ts
// Role: In-memory replicated auction state. Every peer holds an
//       identical copy — this is the data plane that active
//       replication keeps in sync.
// ═══════════════════════════════════════════════════════

export type AuctionStatus = "PENDING" | "ACTIVE" | "ENDED";

export interface Bid {
  bidId: string;
  auctionId: string;
  userId: string;
  userName?: string;
  amount: number;
  lamportTime: number;
  originPeerId: string;
  wallClock: number;
}

export interface Auction {
  id: string;
  title: string;
  description: string;
  startingBid: number;
  reservePrice: number;
  minParticipants: number;
  durationSeconds: number;
  status: AuctionStatus;
  coordinatorPeerId: string;
  createdAt: number;
  startedAt?: number;
  endsAt?: number;
  participants: string[]; // userIds
  participantNames: Record<string, string>; // userId → display name
  bids: Bid[];            // sorted by (lamportTime, originPeerId)
  highestBid?: Bid;
  winner?: { userId: string; amount: number };
  lamportTime: number;    // last write timestamp
}

class Store {
  private auctions = new Map<string, Auction>();

  upsert(a: Auction): void {
    this.auctions.set(a.id, a);
  }

  get(id: string): Auction | undefined {
    return this.auctions.get(id);
  }

  list(): Auction[] {
    return [...this.auctions.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  size(): number {
    return this.auctions.size;
  }

  activeAuctionCount(coordinatorPeerId: string): number {
    let n = 0;
    for (const a of this.auctions.values()) {
      if (a.coordinatorPeerId === coordinatorPeerId && a.status !== "ENDED") n++;
    }
    return n;
  }

  // Total live auctions this peer holds in its replicated store, regardless
  // of who coordinates them. Useful for the cluster dashboard where every
  // peer should show the same "Auctions" count (active replication).
  liveAuctionCount(): number {
    let n = 0;
    for (const a of this.auctions.values()) {
      if (a.status !== "ENDED") n++;
    }
    return n;
  }

  /** For state sync. */
  snapshot(): Auction[] {
    return [...this.auctions.values()];
  }

  /** Replace entire store (used on peer join). */
  loadSnapshot(auctions: Auction[]): void {
    this.auctions.clear();
    for (const a of auctions) this.auctions.set(a.id, a);
  }
}

export const store = new Store();
