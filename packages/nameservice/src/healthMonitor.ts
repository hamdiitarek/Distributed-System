// ═══════════════════════════════════════════════════════
// File: healthMonitor.ts
// Role: Background failure detector for the NameService.
// ═══════════════════════════════════════════════════════
// DISTRIBUTED SYSTEMS CONCEPT: Failure Detection via Heartbeats
// Problem: In an asynchronous network we cannot distinguish a slow
//          peer from a crashed one. Heartbeats provide a practical
//          (timeout-based) failure detector.
// Solution: Each peer sends a heartbeat every HEARTBEAT_INTERVAL ms.
//          A peer that misses heartbeats for FAILURE_TIMEOUT_MS is
//          declared FAILED, and the rest of the system is notified.
// In this system: When a coordinator peer dies mid-auction, the
//          remaining peers must learn quickly so they can elect a
//          new coordinator and continue serving the auction.
// Trade-offs: This is an unreliable failure detector — a network
//          partition can produce false positives. We mitigate this by
//          choosing a timeout (15s) several times the heartbeat
//          interval (5s).
// ═══════════════════════════════════════════════════════

import axios from "axios";
import { registry, PeerInfo } from "./registry";

export const HEARTBEAT_INTERVAL_MS = 5_000;
export const FAILURE_TIMEOUT_MS = 15_000;
const CHECK_INTERVAL_MS = 3_000;

type FailureListener = (peer: PeerInfo) => void;

class HealthMonitor {
  private timer: NodeJS.Timeout | null = null;
  private listeners: FailureListener[] = [];

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), CHECK_INTERVAL_MS);
    // eslint-disable-next-line no-console
    console.log(`[HealthMonitor] started (timeout=${FAILURE_TIMEOUT_MS}ms)`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onFailure(fn: FailureListener): void {
    this.listeners.push(fn);
  }

  private tick(): void {
    const now = Date.now();
    for (const peer of registry.getAllPeers()) {
      const delta = now - peer.lastHeartbeat;
      if (peer.status === "ACTIVE" && delta > FAILURE_TIMEOUT_MS) {
        registry.markFailed(peer.peerId);
        // eslint-disable-next-line no-console
        console.warn(`[HealthMonitor] peer ${peer.peerId} FAILED (no heartbeat for ${delta}ms)`);
        this.notify(peer);
      }
    }
  }

  private notify(failed: PeerInfo): void {
    for (const fn of this.listeners) {
      try {
        fn(failed);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[HealthMonitor] listener error", err);
      }
    }
    // Best-effort fan-out: tell every surviving peer that one of their
    // neighbours has failed so they can update their local PeerRegistry
    // and trigger coordinator re-election.
    for (const survivor of registry.getActivePeers()) {
      if (survivor.peerId === failed.peerId) continue;
      axios
        .post(
          `${survivor.url}/internal/peer-failed`,
          { failedPeerId: failed.peerId },
          { timeout: 3000 }
        )
        .catch(() => {
          /* swallow — peer may itself be unreachable */
        });
    }
  }
}

export const healthMonitor = new HealthMonitor();
