"use client";
import {
  databases,
  APPWRITE_DB_ID,
  APPWRITE_RESULTS_COLLECTION,
  ID,
} from "@/lib/appwrite";

interface PersistInput {
  auctionId: string;
  winnerId?: string | null;
  finalBid?: number | null;
  bidCount: number;
  endedAt: number; // ms epoch
}

const persisted = new Set<string>();

export async function persistAuctionResult(r: PersistInput): Promise<void> {
  if (persisted.has(r.auctionId)) return;
  persisted.add(r.auctionId);
  try {
    await databases.createDocument(
      APPWRITE_DB_ID,
      APPWRITE_RESULTS_COLLECTION,
      ID.unique(),
      {
        auctionId: r.auctionId,
        winnerId: r.winnerId ?? null,
        finalBid: r.finalBid ?? null,
        bidCount: r.bidCount,
        endedAt: new Date(r.endedAt).toISOString(),
      }
    );
  } catch (err: any) {
    // 409 = unique-index conflict (another client already persisted it). Fine.
    const code = err?.code ?? err?.response?.code;
    if (code !== 409) {
      // eslint-disable-next-line no-console
      console.warn("[persistAuctionResult] failed:", err?.message ?? err);
      persisted.delete(r.auctionId);
    }
  }
}
