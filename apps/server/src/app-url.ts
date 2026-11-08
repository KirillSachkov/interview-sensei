/** Wildcard addresses listen on every interface; a browser reaches them through the loopback. */
const loopbackForWildcard: Readonly<Record<string, string>> = {
  "0.0.0.0": "127.0.0.1",
  "::": "::1",
};

/**
 * The URL to open the app at, from the address and port the server listens on. An IPv6 address
 * gets brackets; a wildcard address becomes the loopback address of its family.
 */
export function appUrl({ address, port }: { address: string; port: number }): string {
  const host = loopbackForWildcard[address] ?? address;
  return new URL(`http://${host.includes(":") ? `[${host}]` : host}:${port}/`).href;
}
