import type { z } from "zod";

/** The AgentSession whose MCP address received the tool call. */
export interface ToolSession {
  readonly sessionId: string;
  /** Absent for sessions without a Target, including the service chat. */
  readonly targetId?: string | null;
  /** The session kind, such as `service-chat`. */
  readonly kind: string;
}

/** How a feature slice describes one tool of our MCP server. */
interface ToolDefinition<Input extends z.ZodObject> {
  /** The MCP tool name in snake_case, such as `get_brief`. */
  readonly name: string;
  /** What the tool does and when to call it, for the agent; in English. */
  readonly description: string;
  readonly input: Input;
  /** Returns the text the agent receives as the tool result. */
  readonly run: (input: z.infer<Input>, session: ToolSession) => Promise<string>;
}

/**
 * One tool of our MCP server. A feature slice defines its tools with `sessionTool` in its
 * application layer and exports them; the server lists them in the tool set of each session kind.
 * The tool acts only on the session it receives, never on another one.
 */
export interface SessionTool {
  readonly name: string;
  readonly description: string;
  readonly input: z.ZodObject;
  /** Checks the input against the schema, then runs the tool. */
  readonly run: (input: unknown, session: ToolSession) => Promise<string>;
}

export function sessionTool<Input extends z.ZodObject>(tool: ToolDefinition<Input>): SessionTool {
  return { ...tool, run: async (input, session) => tool.run(tool.input.parse(input), session) };
}
