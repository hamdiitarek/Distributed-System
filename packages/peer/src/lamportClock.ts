// ═══════════════════════════════════════════════════════
// File: lamportClock.ts
// Role: Logical clock used by this peer to timestamp every event
//       (bid, replication message, NameService interaction).
// ═══════════════════════════════════════════════════════
// DISTRIBUTED SYSTEMS CONCEPT: Lamport Logical Clocks
// ═══════════════════════════════════════════════════════
// Problem: Physical clocks on different machines drift; a bid placed
//          "first" on peer A may arrive at peer B with a timestamp
//          that appears later than a bid placed "second" on peer B.
//          We need a way to establish a happens-before relation
//          (→) across nodes without trusting wall-clock time.
//
// Solution: Each process maintains an integer clock L. Rules:
//      (R1) Before any local event or send:  L ← L + 1
//      (R2) On receiving a message tagged t: L ← max(L, t) + 1
//          This guarantees: a → b  implies  L(a) < L(b)
//
// Total order: Two unrelated events can share an L value. To obtain
//      a *total* order (needed by sequential consistency), we break
//      ties using the peerId (lexicographic). Pair (L, peerId) is
//      then a strict total order across the system.
//
// In this system: Every bid carries (lamportTime, peerId). All peers
//      apply bids in this total order, so they converge on the same
//      highest-bid winner regardless of network delay.
//
// Trade-offs: Lamport clocks capture happens-before but NOT causal
//      independence — concurrent events cannot be detected. For
//      auction ordering this is sufficient (we only need total order).
//      Vector clocks would offer causality detection at higher cost.
// ═══════════════════════════════════════════════════════

export class LamportClock {
  private t = 0;

  /** R1: increment on a local event (e.g. about to send a message). */
  tick(): number {
    this.t += 1;
    return this.t;
  }

  /** Convenience alias used by senders. */
  send(): number {
    return this.tick();
  }

  /** R2: merge with the timestamp on an inbound message. */
  receive(remoteTime: number): number {
    this.t = Math.max(this.t, remoteTime | 0) + 1;
    return this.t;
  }

  getTime(): number {
    return this.t;
  }

  /** For state synchronisation: bring the local clock up to a snapshot. */
  setIfGreater(remote: number): void {
    if (remote > this.t) this.t = remote;
  }
}

/** Strict total order: smaller (time, peerId) comes first. */
export function lamportCompare(
  a: { lamportTime: number; peerId: string },
  b: { lamportTime: number; peerId: string }
): number {
  if (a.lamportTime !== b.lamportTime) return a.lamportTime - b.lamportTime;
  return a.peerId.localeCompare(b.peerId);
}

// One shared clock per peer process.
export const clock = new LamportClock();
