/** Serves one MCP address over streamable HTTP: a web-standard request in, its response out. */
export interface McpEndpoint {
  /** `body` is the request body that the HTTP server has already parsed as JSON. */
  readonly handle: (request: Request, body: unknown) => Promise<Response>;
  /** Ends the requests in progress. */
  readonly close: () => Promise<void>;
}
