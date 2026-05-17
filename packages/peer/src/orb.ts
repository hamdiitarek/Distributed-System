// ═══════════════════════════════════════════════════════
// File: orb.ts
// Role: Object Request Broker — middleware that decouples callers
//       from the physical location of services. Callers invoke a
//       named operation; the ORB resolves it to a peer, forwards
//       the request, and handles retries + failover.
// ═══════════════════════════════════════════════════════
// DISTRIBUTED SYSTEMS CONCEPT: Object Request Broker (CORBA-style)
// ═══════════════════════════════════════════════════════
// Problem: Callers should not know which peer hosts which auction,
//          nor what its IP is. They should call a symbolic name and
//          let the middleware figure out the wire details.
//
// Solution: An ORB that:
//   • Resolves operation → endpoint via the NameService.
//   • Injects a Lamport timestamp + originPeerId into every call,
//     so receivers can merge logical clocks (R2) and replicate.
//   • Retries failed requests with exponential back-off (3 attempts).
//   • On final failure, asks the NameService for a failover peer.
//
// In this system: Used by (a) the Next.js API proxy via orb-client.ts
//   to dispatch user actions to a peer, and (b) inter-peer calls
//   for replication and Ricart–Agrawala messages.
//
// Trade-offs: Adds one indirection per call (lookup + retry logic),
//   but provides location transparency and graceful degradation when
//   peers crash, which is the whole point of a distributed system.
// ═══════════════════════════════════════════════════════

import axios, { AxiosError } from "axios";
import { clock } from "./lamportClock";
import { peerRegistry } from "./peerRegistry";

export interface ORBRequest {
  operation: string;
  params: Record<string, unknown>;
  lamportTime: number;
  originPeerId: string;
}

export interface ORBLogEntry {
  ts: number;
  operation: string;
  targetPeerId: string;
  attempts: number;
  ok: boolean;
  error?: string;
  lamportTime: number;
}

const log: ORBLogEntry[] = [];
const MAX_LOG = 200;

function record(entry: ORBLogEntry) {
  log.push(entry);
  if (log.length > MAX_LOG) log.shift();
}

export function getORBLog(): ORBLogEntry[] {
  return log.slice(-100);
}

/**
 * Map a symbolic operation name → HTTP path on the target peer.
 * The mapping is the IDL-equivalent of CORBA's stub layer.
 */
function resolvePath(operation: string): string {
  switch (operation) {
    case "auction.create":
      return "/auctions";
    case "auction.get":
      return "/auctions/:id";
    case "auction.list":
      return "/auctions";
    case "auction.placeBid":
      return "/bids";
    case "auction.join":
      return "/auctions/:id/join";
    case "auction.leave":
      return "/auctions/:id/leave";
    case "peer.stateSync":
      return "/peer/state";
    default:
      throw new Error(`ORB: unknown operation '${operation}'`);
  }
}

function method(operation: string): "GET" | "POST" {
  if (operation === "auction.get" || operation === "auction.list" || operation === "peer.stateSync")
    return "GET";
  return "POST";
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Build full URL by templating :id into the path. */
function buildUrl(baseUrl: string, path: string, params: Record<string, unknown>): string {
  let p = path;
  if (p.includes(":id")) {
    const id = String(params.auctionId ?? params.id ?? "");
    p = p.replace(":id", encodeURIComponent(id));
  }
  return `${baseUrl}${p}`;
}

/**
 * Invoke an operation against a specific peer.
 * Caller chose the peer (e.g. coordinator); ORB handles retries + clock.
 */
export async function invokeOn<T = any>(
  peerId: string,
  operation: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const targetPath = resolvePath(operation);
  const verb = method(operation);
  const maxAttempts = 3;

  let attempt = 0;
  let currentPeerId = peerId;
  let lastErr: any;

  while (attempt < maxAttempts) {
    attempt++;
    const peer = peerRegistry.get(currentPeerId);
    if (!peer) {
      lastErr = new Error(`peer '${currentPeerId}' not in local registry`);
      // try a refresh + failover
      await peerRegistry.refreshFromNameService();
      currentPeerId = peerRegistry.others()[0]?.peerId ?? currentPeerId;
      continue;
    }

    const lamportTime = clock.tick();
    const body: ORBRequest = {
      operation,
      params,
      lamportTime,
      originPeerId: peerRegistry.selfId(),
    };

    try {
      const url = buildUrl(peer.url, targetPath, params);
      const res = await axios.request<T>({
        method: verb,
        url,
        data: verb === "POST" ? body : undefined,
        params: verb === "GET" ? params : undefined,
        headers: { "X-Lamport-Time": String(lamportTime), "X-Origin-Peer": peerRegistry.selfId() },
        timeout: 8000,
      });
      record({
        ts: Date.now(),
        operation,
        targetPeerId: currentPeerId,
        attempts: attempt,
        ok: true,
        lamportTime,
      });
      return res.data;
    } catch (err) {
      lastErr = err;
      const status = (err as AxiosError)?.response?.status;
      record({
        ts: Date.now(),
        operation,
        targetPeerId: currentPeerId,
        attempts: attempt,
        ok: false,
        error: `${status ?? "ERR"} ${(err as Error).message}`,
        lamportTime,
      });

      // Failover after final retry: ask NameService for a fresh peer.
      if (attempt === maxAttempts - 1) {
        await peerRegistry.refreshFromNameService();
        const fallback = peerRegistry.others()[0];
        if (fallback) currentPeerId = fallback.peerId;
      }
      await sleep(150 * 2 ** (attempt - 1)); // exponential back-off
    }
  }

  throw new Error(
    `ORB.invokeOn(${operation}) failed after ${maxAttempts} attempts: ${(lastErr as Error)?.message}`
  );
}

/** Ask the NameService which peer should serve a given auctionId. */
export async function resolveCoordinator(auctionId: string): Promise<{ peerId: string; url: string }> {
  const ns = peerRegistry.nameServiceUrl();
  const { data } = await axios.post(`${ns}/assign-peer`, { auctionId }, { timeout: 5000 });
  if (!data?.assignedPeer) throw new Error("NameService returned no peer");
  return data.assignedPeer;
}
