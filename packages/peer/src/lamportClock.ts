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
