// Peers register with PUBLIC_URL=http://host.docker.internal:PORT so that
// sibling containers can reach them. When Next.js runs on the host Mac (dev),
// `host.docker.internal` does not resolve, so we rewrite it to localhost.
export function localizePeerUrl(url: string): string {
  return url.replace("host.docker.internal", "localhost");
}

// Returns a peer URL suitable for the *browser* to connect to.
// When port-forwarding or running on a remote device, set PUBLIC_PEER_BASE_URL
// (e.g. http://192.168.1.5:4001 or https://xyz.ngrok.io) so that browsers on
// other devices can reach the peer. Without it, falls back to localizePeerUrl.
export function publicPeerUrl(url: string): string {
  const base = process.env.PUBLIC_PEER_BASE_URL;
  if (!base) return localizePeerUrl(url);
  // Replace the origin (scheme+host+port) in the registered URL with the public base.
  try {
    const parsed = new URL(url);
    const pub = new URL(base);
    parsed.hostname = pub.hostname;
    parsed.port = pub.port;
    parsed.protocol = pub.protocol;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return base;
  }
}
