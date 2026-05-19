import axios from "axios";
import { peerRegistry } from "./peerRegistry";

const NS = peerRegistry.nameServiceUrl();

interface EventInput {
  kind: string;
  from?: string;
  to?: string;
  auctionId?: string;
  detail?: string;
}

export function reportEvent(e: EventInput): void {
  axios
    .post(`${NS}/events`, e, { timeout: 2000 })
    .catch(() => undefined);
}
