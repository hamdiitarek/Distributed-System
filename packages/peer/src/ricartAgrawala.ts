import axios from "axios";
import { clock } from "./lamportClock";
import { peerRegistry } from "./peerRegistry";

type ResourceId = string;

interface PendingRequest {
  ts: number;
  peerId: string;
}

interface ResourceState {
  /** true while THIS peer holds the CS for this resource. */
  inCS: boolean;
  /** true if THIS peer has issued a REQUEST it is still waiting on. */
  requesting: boolean;
  /** The (ts, peerId) of our outstanding request, if any. */
  myRequest?: PendingRequest;
  /** PeerIds whose REPLY we are still awaiting. */
  awaitingReplies: Set<string>;
  /** PeerIds whose REQUEST we deferred — owe them a REPLY on exit. */
  deferred: Set<string>;
  /** Resolvers waiting to be released once we acquire CS. */
  waiters: Array<() => void>;
}

class RicartAgrawala {
  private resources = new Map<ResourceId, ResourceState>();

  private state(resourceId: ResourceId): ResourceState {
    let s = this.resources.get(resourceId);
    if (!s) {
      s = {
        inCS: false,
        requesting: false,
        awaitingReplies: new Set(),
        deferred: new Set(),
        waiters: [],
      };
      this.resources.set(resourceId, s);
    }
    return s;
  }

  /**
   * Acquire the critical section. Resolves once every active peer
   * has replied. The returned `release` MUST be called in a finally.
   */
  async acquire(resourceId: ResourceId): Promise<() => Promise<void>> {
    const s = this.state(resourceId);

    // If we already hold or are requesting it, queue up.
    if (s.requesting || s.inCS) {
      await new Promise<void>((resolve) => s.waiters.push(resolve));
    }

    const ts = clock.tick();
    const myId = peerRegistry.selfId();
    s.requesting = true;
    s.myRequest = { ts, peerId: myId };

    const others = peerRegistry.others();
    s.awaitingReplies = new Set(others.map((p) => p.peerId));

    // If there are no other peers, we may enter CS immediately.
    if (others.length === 0) {
      s.requesting = false;
      s.inCS = true;
      return () => this.release(resourceId);
    }

    // Broadcast REQUESTs. Failed sends (peer unreachable) are treated
    // as implicit REPLYs so the algorithm makes progress under faults.
    const replyPromise = new Promise<void>((resolve) => {
      const check = () => {
        if (s.awaitingReplies.size === 0) {
          s.requesting = false;
          s.inCS = true;
          resolve();
        }
      };
      (s as any).__check = check;
    });

    for (const peer of others) {
      axios
        .post(
          `${peer.url}/ra/request`,
          { resourceId, ts, peerId: myId },
          { timeout: 5000 }
        )
        .catch(() => {
          // Treat unreachable peer as an implicit REPLY.
          this.markReplyReceived(resourceId, peer.peerId);
        });
    }

    await replyPromise;
    return () => this.release(resourceId);
  }

  /** Called by HTTP handler when a REPLY arrives. */
  markReplyReceived(resourceId: ResourceId, fromPeerId: string): void {
    const s = this.state(resourceId);
    if (s.awaitingReplies.delete(fromPeerId)) {
      const check = (s as any).__check as (() => void) | undefined;
      check?.();
    }
  }

  /**
   * Called by HTTP handler when a REQUEST arrives.
   * Returns immediately with `defer=true` or `defer=false`.
   */
  handleIncomingRequest(
    resourceId: ResourceId,
    fromTs: number,
    fromPeerId: string
  ): { defer: boolean } {
    clock.receive(fromTs);
    const s = this.state(resourceId);

    // ── Decide DEFER vs REPLY-NOW ───────────────────────────────
    // Defer if:
    //   * I'm in CS for this resource, OR
    //   * I'm requesting it and MY request has priority.
    // Otherwise reply immediately.
    let defer = false;
    if (s.inCS) {
      defer = true;
    } else if (s.requesting && s.myRequest) {
      const mine = s.myRequest;
      const myPriority =
        mine.ts < fromTs ||
        (mine.ts === fromTs && mine.peerId.localeCompare(fromPeerId) < 0);
      defer = myPriority;
    }

    if (defer) {
      s.deferred.add(fromPeerId);
    }
    return { defer };
  }

  /** Drop a failed peer from any wait set so we don't block forever. */
  onPeerFailed(failedPeerId: string): void {
    for (const [rid, s] of this.resources) {
      if (s.awaitingReplies.delete(failedPeerId)) {
        const check = (s as any).__check as (() => void) | undefined;
        check?.();
        // eslint-disable-next-line no-console
        console.warn(`[RA] removed failed peer ${failedPeerId} from waitset for ${rid}`);
      }
      s.deferred.delete(failedPeerId);
    }
  }

  private async release(resourceId: ResourceId): Promise<void> {
    const s = this.state(resourceId);
    s.inCS = false;
    s.myRequest = undefined;

    const owed = [...s.deferred];
    s.deferred.clear();

    // Send deferred REPLYs.
    const myId = peerRegistry.selfId();
    const ts = clock.tick();
    await Promise.all(
      owed.map((peerId) => {
        const peer = peerRegistry.get(peerId);
        if (!peer) return Promise.resolve();
        return axios
          .post(
            `${peer.url}/ra/reply`,
            { resourceId, ts, peerId: myId },
            { timeout: 5000 }
          )
          .catch(() => undefined);
      })
    );

    // Wake the next local waiter, if any.
    const next = s.waiters.shift();
    if (next) next();
  }

  /** Diagnostic snapshot for the DSInfoPanel. */
  snapshot() {
    const out: Record<string, any> = {};
    for (const [rid, s] of this.resources) {
      out[rid] = {
        inCS: s.inCS,
        requesting: s.requesting,
        awaitingReplies: [...s.awaitingReplies],
        deferred: [...s.deferred],
      };
    }
    return out;
  }
}

export const ricartAgrawala = new RicartAgrawala();
