// Disable all caching for the auction room. The client component below
// is real-time over Socket.IO, but Next.js still caches RSC payloads and
// the route shell — which can serve stale auction state on navigation.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function AuctionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
