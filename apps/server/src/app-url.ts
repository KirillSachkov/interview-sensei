/** The URL to open the app at, from the loopback address and port the server listens on. */
export function appUrl({ address, port }: { address: string; port: number }): string {
  return new URL(`http://${address.includes(":") ? `[${address}]` : address}:${port}/`).href;
}
