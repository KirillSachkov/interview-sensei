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

/** What a tool call returned: its text, and whether the tool reported an error. */
interface ToolResult {
  readonly text: string;
  readonly isError: boolean;
}

function toolResult(result: unknown): ToolResult {
  const isError =
    typeof result === "object" && result !== null && "isError" in result && result.isError === true;
  return { text: toolText(result), isError };
}

/** Initializes an MCP session at the address and calls the tool with the arguments. */
export async function callMcpTool(
  url: string,
  name: string,
  args: object = {},
): Promise<ToolResult> {
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
  const result = resultOf(
    await post(url, { id: nextId++, method: "tools/call", params: { name, arguments: args } }),
  );
  return toolResult(result);
}
