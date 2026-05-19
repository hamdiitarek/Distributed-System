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
