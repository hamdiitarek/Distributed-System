// Peers register with PUBLIC_URL=http://host.docker.internal:PORT so that
// sibling containers can reach them. When Next.js runs on the host Mac (dev),
// `host.docker.internal` does not resolve, so we rewrite it to localhost.
export function localizePeerUrl(url: string): string {
  return url.replace("host.docker.internal", "localhost");
}
