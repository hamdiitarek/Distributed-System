import axios from "axios";
import { peerRegistry } from "./peerRegistry";
import { clock } from "./lamportClock";
import { store } from "./store";
import { syncStateFromAnyPeer } from "./stateSync";

const NS = peerRegistry.nameServiceUrl();
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4001}`;
let resyncing = false;
let reregistering = false;

async function reregister(): Promise<void> {
  if (reregistering) return;
  reregistering = true;
  try {
    const { data } = await axios.post(
      `${NS}/register`,
      { peerId: peerRegistry.selfId(), url: PUBLIC_URL, capacity: 100 },
      { timeout: 5000 }
    );
    peerRegistry.setAll(
      (data.currentPeers ?? []).map((p: any) => ({ peerId: p.peerId, url: p.url }))
    );
    // eslint-disable-next-line no-console
    console.warn(`[peer ${peerRegistry.selfId()}] re-registered with NameService`);
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.warn(`[peer ${peerRegistry.selfId()}] re-register failed:`, err?.message ?? err);
  } finally {
    reregistering = false;
  }
}

export function pushHeartbeat(): void {
  const peerId = peerRegistry.selfId();
  axios
    .post(
      `${NS}/heartbeat`,
      {
        peerId,
        load: store.activeAuctionCount(peerId),
        auctionCount: store.liveAuctionCount(),
        lamportTime: clock.getTime(),
      },
      { timeout: 4000, validateStatus: () => true }
    )
    .then((r) => {
      if (r.status === 404) {
        // NameService lost us. Re-register on the next tick.
        reregister();
        return;
      }
      if (r.data?.shouldResync && !resyncing) {
        resyncing = true;
        // eslint-disable-next-line no-console
        console.warn(`[peer ${peerId}] NameService says we were marked failed — re-syncing state`);
        syncStateFromAnyPeer()
          .catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(`[peer ${peerId}] resync failed:`, err?.message ?? err);
          })
          .finally(() => {
            resyncing = false;
          });
      }
    })
    .catch(() => undefined);
}
