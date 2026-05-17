"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";
import { ORB } from "@/lib/orb-client";
import { useAuth } from "@/lib/auth-context";
import { persistAuctionResult } from "@/lib/results";
import BidForm from "@/components/BidForm";
import BidHistory, { BidLine } from "@/components/BidHistory";
import CountdownTimer from "@/components/CountdownTimer";
import ParticipantsList from "@/components/ParticipantsList";
import ConnectionStatus from "@/components/ConnectionStatus";
import DSInfoPanel from "@/components/DSInfoPanel";
import Confetti from "@/components/Confetti";

type Status = "PENDING" | "ACTIVE" | "ENDED";

interface AuctionDTO {
  id: string;
  title: string;
  description: string;
  startingBid: number;
  reservePrice: number;
  minParticipants: number;
  status: Status;
  endsAt?: number;
  participants: string[];
  participantNames?: Record<string, string>;
  bids: BidLine[];
  highestBid?: BidLine;
  winner?: { userId: string; amount: number };
  lamportTime: number;
  coordinatorPeerId: string;
}

export default function AuctionRoom() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const auctionId = params.id;
  const { user, loading: authLoading } = useAuth();

  const [auction, setAuction] = useState<AuctionDTO | null>(null);
  const [connected, setConnected] = useState(false);
  const [peerId, setPeerId] = useState<string | undefined>(undefined);
  const [replicaCount, setReplicaCount] = useState<number | undefined>(undefined);
  const [lamport, setLamport] = useState<number>(0);

  const userId = user?.$id;
  const userName = user?.name || user?.email;

  useEffect(() => {
    ORB.getAuction(auctionId).then((r) => {
      if (r.success && r.data?.auction) {
        setAuction(r.data.auction);
        setLamport(r.data.auction.lamportTime ?? 0);
      }
    });
  }, [auctionId]);

  // Poll the socket-routing endpoint once per second so the "via PEER-N"
  // label reflects the current coordinator. If the coordinator is re-elected
  // (e.g. via the /cluster crash button), this picks up the new peerId
  // within a second without reloading the page.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const res = await fetch(
          `/api/socket?auctionId=${encodeURIComponent(auctionId)}`,
          { cache: "no-store" }
        );
        const j = await res.json();
        if (cancelled) return;
        if (j?.peerId) setPeerId(j.peerId);
        if (typeof j?.replicaCount === "number") setReplicaCount(j.replicaCount);
      } catch {
        // ignore — connection status comes from the socket itself
      }
    }
    const t = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [auctionId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let socket: ReturnType<typeof getSocket> | undefined;

    // Named handlers so cleanup removes only ours, not all listeners
    // (other concurrent mounts in StrictMode would otherwise lose theirs).
    const onConnect = () => {
      setConnected(true);
      socket?.emit("auction:join", { auctionId, userId, userName });
    };
    const onDisconnect = () => setConnected(false);
    const onPeerInfo = (info: any) => {
      setPeerId(info.servingPeerId);
      setReplicaCount(info.replicaCount);
      setLamport(info.lamportTime ?? 0);
    };
    const onState = (s: any) => {
      setAuction((prev) => ({ ...(prev as any), ...s.auction }));
    };
    const onBidUpdate = (u: any) => {
      setLamport(u.lamportTime ?? 0);
      setAuction((prev) => {
        if (!prev) return prev;
        const bids = [...prev.bids.filter((b) => b.bidId !== u.newBid.bidId), u.newBid];
        return { ...prev, bids, highestBid: u.highestBid, lamportTime: u.lamportTime };
      });
    };
    const onTimer = (t: any) => {
      setAuction((prev) =>
        prev ? { ...prev, status: t.status, endsAt: Date.now() + t.timeRemaining * 1000 } : prev
      );
    };
    const onEnded = (e: any) => {
      setAuction((prev) =>
        prev ? { ...prev, status: "ENDED", winner: e.winner, bids: e.bidHistory ?? prev.bids } : prev
      );
    };
    const onError = (e: any) => {
      // eslint-disable-next-line no-console
      console.warn("auction:error", e);
    };

    (async () => {
      const res = await fetch(`/api/socket?auctionId=${encodeURIComponent(auctionId)}`, { cache: "no-store" });
      const j = await res.json();
      if (cancelled || !j?.url) return;
      setPeerId(j.peerId);
      setReplicaCount(j.replicaCount);
      socket = getSocket(j.url);

      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);
      socket.on("peer:info", onPeerInfo);
      socket.on("auction:state", onState);
      socket.on("auction:bid_update", onBidUpdate);
      socket.on("auction:timer", onTimer);
      socket.on("auction:ended", onEnded);
      socket.on("auction:error", onError);

      // Singleton may already be connected from a prior mount — "connect"
      // won't fire again. Sync state and emit join immediately.
      if (socket.connected) {
        setConnected(true);
        socket.emit("auction:join", { auctionId, userId, userName });
      }
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.emit("auction:leave", { auctionId, userId });
        socket.off("connect", onConnect);
        socket.off("disconnect", onDisconnect);
        socket.off("peer:info", onPeerInfo);
        socket.off("auction:state", onState);
        socket.off("auction:bid_update", onBidUpdate);
        socket.off("auction:timer", onTimer);
        socket.off("auction:ended", onEnded);
        socket.off("auction:error", onError);
      }
    };
  }, [auctionId, userId, userName]);

  // Persist ended auctions to Appwrite (idempotent via unique auctionId index).
  useEffect(() => {
    if (!auction || auction.status !== "ENDED") return;
    persistAuctionResult({
      auctionId: auction.id,
      winnerId: auction.winner?.userId ?? null,
      finalBid: auction.winner?.amount ?? auction.highestBid?.amount ?? null,
      bidCount: auction.bids.length,
      endedAt: Date.now(),
    });
  }, [auction?.id, auction?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentBid = useMemo(
    () => auction?.highestBid?.amount ?? auction?.startingBid ?? 0,
    [auction]
  );

  async function submitBid(amount: number) {
    if (!userId) return { ok: false, error: "Not signed in" };
    const r = await ORB.placeBid({ auctionId, userId, userName, amount });
    if (!r.success) return { ok: false, error: r.error };
    return { ok: true };
  }

  if (authLoading || !auction) {
    return <div className="text-neutral-500 text-sm">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto gild-border p-8 text-center">
        <h2 className="text-xl font-semibold text-white mb-2">Sign in to join this auction</h2>
        <p className="text-sm text-neutral-500 mb-6">
          You need an account to view bidder identities and place bids.
        </p>
        <Link href="/login" className="btn-gold inline-block">Sign in</Link>
      </div>
    );
  }

  const isWinner = auction.status === "ENDED" && auction.winner?.userId === userId;
  const winnerLabel = auction.winner
    ? auction.participantNames?.[auction.winner.userId] ?? auction.winner.userId.slice(0, 16)
    : null;

  return (
    <div className="relative">
      <Confetti active={isWinner} />

      {auction.status === "ENDED" && (
        <div className="fixed inset-0 z-40 bg-ink-950/85 backdrop-blur flex items-center justify-center p-6">
          <div className="gild-border p-10 max-w-md w-full text-center">
            {auction.winner ? (
              <>
                <p className="text-xs text-neutral-500">
                  {isWinner ? "Congratulations" : "Sold"}
                </p>
                <h2 className="text-5xl font-semibold tracking-tight text-white my-3">
                  ${auction.winner.amount.toLocaleString()}
                </h2>
                {isWinner ? (
                  <p className="text-gold-400 text-lg mb-6">You won this auction!</p>
                ) : (
                  <p className="text-neutral-300 mb-6">
                    Winner:{" "}
                    <span className="font-mono text-gold-400">{winnerLabel}</span>
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-neutral-500">Closed</p>
                <h2 className="text-3xl font-semibold tracking-tight text-white my-3">
                  No sale
                </h2>
                <p className="text-neutral-400 mb-6">
                  Reserve price was not met.
                </p>
              </>
            )}
            <button
              onClick={() => router.push("/lobby")}
              className="btn-gold w-full"
            >
              Return to lobby
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{auction.title}</h1>
          <p className="text-neutral-500 max-w-xl mt-1">{auction.description}</p>
        </div>
        <ConnectionStatus connected={connected} peerId={peerId} auctionStatus={auction.status} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="gild-border p-8 flex items-center justify-between">
            <div>
              <div className="text-xs text-neutral-500">Current bid</div>
              <div className="text-5xl font-semibold tracking-tight text-white">
                ${currentBid.toLocaleString()}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                Reserve: ${auction.reservePrice.toLocaleString()}
              </div>
            </div>
            {auction.status === "ACTIVE" && <CountdownTimer endsAt={auction.endsAt} />}
            {auction.status === "PENDING" && (
              <div className="text-right">
                <div className="chip chip-pending">Awaiting bidders</div>
                <p className="text-xs text-neutral-500 mt-2">
                  {(() => {
                    const need = Math.max(
                      0,
                      (auction.minParticipants ?? 2) - auction.participants.length
                    );
                    return need === 0
                      ? "Quorum met — starting…"
                      : `Need ${need} more to start`;
                  })()}
                </p>
              </div>
            )}
          </div>

          {auction.status === "ACTIVE" && (
            <BidForm
              currentBid={currentBid}
              onSubmit={submitBid}
              disabled={!connected}
            />
          )}

          <BidHistory bids={auction.bids} />
        </div>

        <aside className="space-y-6">
          <ParticipantsList users={auction.participants} names={auction.participantNames} />
          <DSInfoPanel
            servingPeerId={peerId}
            replicaCount={replicaCount}
            lamportTime={lamport}
            mutexState={`auction:${auction.id} idle`}
          />
          <div className="gild-border p-5 text-xs text-neutral-400 leading-relaxed">
            <p className="text-gold-400 mb-2">Coordinator</p>
            <p className="font-mono text-neutral-200">{auction.coordinatorPeerId}</p>
            <p className="mt-2 text-neutral-500">
              Bids are written under a Ricart–Agrawala mutex and actively replicated to
              all peers, ordered by Lamport timestamp.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
