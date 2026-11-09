/**
 * The hosts the server may listen on and the names the browser may reach it by. The MCP SDK's
 * DNS-rebinding check accepts the same three, so an agent reaches its MCP address on each of them.
 */
const loopbackHosts: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "localhost"]);

/** Whether `host`, a SERVER_HOST value or a URL hostname with or without brackets, is loopback. */
export function isLoopbackHost(host: string): boolean {
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return loopbackHosts.has(bare.toLowerCase());
}
