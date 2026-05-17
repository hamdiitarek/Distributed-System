// ═══════════════════════════════════════════════════════
// File: peerRegistry.ts
// Role: Local cache of the active peer list pulled from the
//       NameService. All inter-peer communication consults this list.
// ═══════════════════════════════════════════════════════
import axios from "axios";

export interface RemotePeer {
  peerId: string;
  url: string;
}

const PEER_ID = process.env.PEER_ID ?? "peer-unknown";
const NAME_SERVICE_URL =
  process.env.NAME_SERVICE_URL ?? "http://localhost:3001";

class LocalPeerRegistry {
  private peers = new Map<string, RemotePeer>();

  selfId(): string {
    return PEER_ID;
  }

  nameServiceUrl(): string {
    return NAME_SERVICE_URL;
  }

  setAll(peers: RemotePeer[]): void {
    this.peers.clear();
    for (const p of peers) this.peers.set(p.peerId, { peerId: p.peerId, url: p.url });
  }

  remove(peerId: string): boolean {
    return this.peers.delete(peerId);
  }

  add(p: RemotePeer): void {
    this.peers.set(p.peerId, p);
  }

  others(): RemotePeer[] {
    return [...this.peers.values()].filter((p) => p.peerId !== PEER_ID);
  }

  all(): RemotePeer[] {
    return [...this.peers.values()];
  }

  get(peerId: string): RemotePeer | undefined {
    return this.peers.get(peerId);
  }

  async refreshFromNameService(): Promise<void> {
    try {
      const { data } = await axios.get(`${NAME_SERVICE_URL}/peers`, { timeout: 4000 });
      const list: RemotePeer[] = (data.peers ?? []).map((p: any) => ({
        peerId: p.peerId,
        url: p.url,
      }));
      this.setAll(list);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.warn(`[PeerRegistry] refresh failed: ${err?.message ?? err}`);
    }
  }
}

export const peerRegistry = new LocalPeerRegistry();
