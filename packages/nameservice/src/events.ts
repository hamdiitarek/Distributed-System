// ═══════════════════════════════════════════════════════
// File: events.ts
// Role: Rolling buffer of recent cluster transactions for the
//       public /cluster live dashboard. Peers POST every notable
//       inter-peer operation here; the NameService never persists
//       them and the buffer is capped to MAX entries.
// ═══════════════════════════════════════════════════════

export type ClusterEventKind =
  | "register"
  | "deregister"
  | "heartbeat"
  | "assign"
  | "bid"
  | "replicate-out"
  | "replicate-in"
  | "participant"
  | "status"
  | "winner"
  | "peer-failed"
  | "elect";

export interface ClusterEvent {
  id: number;
  t: number; // epoch ms
  kind: ClusterEventKind;
  from?: string; // peerId
  to?: string;   // peerId (for replicate-out, assign)
  auctionId?: string;
  detail?: string;
}

const MAX = 200;
let nextId = 1;
const buffer: ClusterEvent[] = [];

export function recordEvent(e: Omit<ClusterEvent, "id" | "t">): ClusterEvent {
  const ev: ClusterEvent = { id: nextId++, t: Date.now(), ...e };
  buffer.push(ev);
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
  return ev;
}

export function listEvents(sinceId?: number): ClusterEvent[] {
  if (sinceId === undefined) return [...buffer];
  return buffer.filter((e) => e.id > sinceId);
}
