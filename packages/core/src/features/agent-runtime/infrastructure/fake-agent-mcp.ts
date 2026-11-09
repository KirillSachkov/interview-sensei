// The fake agent's MCP client: streamable HTTP of the 2025-06-18 revision, which the agents'
// own MCP clients speak. It sends only what one tool call needs.

const protocolVersion = "2025-06-18";

let nextId = 1;

/** The JSON-RPC message of the response: the body itself, or the first SSE `data:` line. */
async function responseMessage(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    return JSON.parse(text);
  }
  const data = text.split("\n").find((line) => line.startsWith("data:"));
  return data === undefined ? undefined : JSON.parse(data.slice("data:".length));
}

async function post(url: string, message: object): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": protocolVersion,
    },
    body: JSON.stringify({ jsonrpc: "2.0", ...message }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.status === 202 ? undefined : responseMessage(response);
}

function resultOf(message: unknown): unknown {
  if (typeof message !== "object" || message === null || !("result" in message)) {
    throw new Error(`MCP error: ${JSON.stringify(message)}`);
  }
  return message.result;
}

/** The text content of a tool result. */
function toolText(result: unknown): string {
  const content =
    typeof result === "object" && result !== null && "content" in result ? result.content : [];
  return (Array.isArray(content) ? content : [])
    .map((block: unknown) =>
      typeof block === "object" && block !== null && "text" in block ? String(block.text) : "",
    )
    .join("");
}

async function initialize(url: string): Promise<void> {
  resultOf(
    await post(url, {
      id: nextId++,
      method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: "interview-sensei-fake-agent", version: "0.0.0" },
      },
    }),
  );
  await post(url, { method: "notifications/initialized" });
}

/** Initializes an MCP session at the address and calls the tool with the arguments. */
export async function callMcpTool(url: string, name: string, input: object = {}): Promise<string> {
  await initialize(url);
  const result = resultOf(
    await post(url, { id: nextId++, method: "tools/call", params: { name, arguments: input } }),
  );
  return toolText(result);
}

/** Initializes an MCP session at the address and lists the names of its tools, sorted. */
export async function listMcpTools(url: string): Promise<string[]> {
  await initialize(url);
  const result = resultOf(await post(url, { id: nextId++, method: "tools/list", params: {} }));
  const tools =
    typeof result === "object" && result !== null && "tools" in result ? result.tools : [];
  return (Array.isArray(tools) ? tools : [])
    .map((tool: unknown) =>
      typeof tool === "object" && tool !== null && "name" in tool ? String(tool.name) : "",
    )
    .toSorted();
}
