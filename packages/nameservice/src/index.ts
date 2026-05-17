// ═══════════════════════════════════════════════════════
// File: nameservice/index.ts
// Role: Entry point of the global NameService used by every peer
//       and (indirectly, through the Next.js API proxy) by the
//       frontend to discover the distributed peer layer.
// ═══════════════════════════════════════════════════════
import express from "express";
import cors from "cors";

import register from "./routes/register";
import deregister from "./routes/deregister";
import peers from "./routes/peers";
import assign from "./routes/assign";
import heartbeat from "./routes/heartbeat";
import events from "./routes/events";
import crash from "./routes/crash";
import { healthMonitor } from "./healthMonitor";
import { registry } from "./registry";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) =>
  res.json({
    status: "ok",
    service: "nameservice",
    peers: registry.getActivePeers().length,
    t: Date.now(),
  })
);

app.use(register);
app.use(deregister);
app.use(peers);
app.use(assign);
app.use(heartbeat);
app.use(events);
app.use(crash);

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[NameService] listening on :${PORT}`);
  healthMonitor.start();
});
