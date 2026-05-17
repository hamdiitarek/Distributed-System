// ═══════════════════════════════════════════════════════
// File: lib/orb-client.ts
// Role: Client-side ORB façade. The browser does NOT talk to peers
//       directly — it talks to Next.js API routes, which act as the
//       secure proxy + ORB on the server side.
// ═══════════════════════════════════════════════════════

export interface ORBCallResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  servingPeerId?: string;
}

async function call<T = any>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: any
): Promise<ORBCallResult<T>> {
  try {
    const res = await fetch(path, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      cache: "no-store",
    });
    const json = await res.json();
    if (!res.ok) return { success: false, error: json?.error ?? `HTTP ${res.status}` };
    return { success: true, data: json as T, servingPeerId: json?.servingPeerId };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "network error" };
  }
}

export const ORB = {
  listAuctions: () => call("/api/auctions", "GET"),
  getAuction: (id: string) => call(`/api/auctions?id=${encodeURIComponent(id)}`, "GET"),
  createAuction: (params: any) => call("/api/auctions", "POST", params),
  placeBid: (params: any) => call("/api/bids", "POST", params),
};
