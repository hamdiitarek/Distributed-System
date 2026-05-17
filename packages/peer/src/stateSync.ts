// ═══════════════════════════════════════════════════════
// File: stateSync.ts
// Role: Full state transfer used when a new peer joins the system
//       or an existing peer reboots and must catch up.
// ═══════════════════════════════════════════════════════
// DISTRIBUTED SYSTEMS CONCEPT: State Synchronisation on Join
// ═══════════════════════════════════════════════════════
// Problem: A peer that has just joined cannot yet serve requests
//          because it does not know about auctions or bids that
//          happened before it came online. Streaming "from now on"
//          via replication is insufficient — past state is missing.
//
// Solution: Joining peer fetches a snapshot from any active peer.
//   The snapshot includes:
//     • Every Auction in the store, including bid history.
//     • The donor's current Lamport time (so the joiner advances
//       its own clock to at least that value — see R2).
//   After loading the snapshot the joiner is eligible to receive
//   live replication messages and serve queries.
//
// In this system: Called from index.ts during the boot sequence
//   after /register succeeds and before the heartbeat loop starts.
//
// Trade-offs: O(state) over the wire on join. For an auction system
//   this is trivial (a few KB), so we use a single REST call rather
//   than a streaming protocol.
// ═══════════════════════════════════════════════════════

import axios from "axios";
import { clock } from "./lamportClock";
import { peerRegistry } from "./peerRegistry";
import { store, Auction } from "./store";

export interface StateSnapshot {
  fromPeerId: string;
  lamportTime: number;
  auctions: Auction[];
  takenAt: number;
}

export function buildSnapshot(): StateSnapshot {
  return {
    fromPeerId: peerRegistry.selfId(),
    lamportTime: clock.getTime(),
    auctions: store.snapshot(),
    takenAt: Date.now(),
  };
}

/**
 * Ask another peer for a full snapshot and merge it into our local
 * store. Tries each known peer in turn until one succeeds.
 */
export async function syncStateFromAnyPeer(): Promise<boolean> {
  const candidates = peerRegistry.others();
  if (candidates.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[stateSync] no peers to sync from — starting fresh");
    return false;
  }

  for (const peer of candidates) {
    try {
      const { data } = await axios.get<StateSnapshot>(`${peer.url}/peer/state`, {
        timeout: 8000,
      });
      clock.setIfGreater(data.lamportTime);
      store.loadSnapshot(data.auctions);
      // eslint-disable-next-line no-console
      console.log(
        `[stateSync] synced ${data.auctions.length} auctions from ${peer.peerId} (Lamport=${data.lamportTime})`
      );
      return true;
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn(`[stateSync] ${peer.peerId} unreachable: ${err?.message ?? err}`);
    }
  }
  return false;
}
