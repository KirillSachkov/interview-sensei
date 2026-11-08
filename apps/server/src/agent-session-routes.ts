import type { AgentRuntime } from "@interview-sensei/core/agent-runtime";
import { sessionKinds } from "@interview-sensei/core/agent-sessions";
import type {
  AgentSessions,
  SessionKind,
  SessionView,
} from "@interview-sensei/core/agent-sessions";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";

const sessionParams = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

/** What the browser sends over the session's WebSocket. */
type Command =
  | { type: "prompt"; text: string }
  | { type: "cancel" }
  | { type: "permission"; requestId: string; optionId: string };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parsePermission(message: object): Command | undefined {
  const requestId = "requestId" in message ? message.requestId : undefined;
  const optionId = "optionId" in message ? message.optionId : undefined;
  return typeof requestId === "string" && typeof optionId === "string"
    ? { type: "permission", requestId, optionId }
    : undefined;
}

function parseCommand(data: unknown): Command | undefined {
  const message = Buffer.isBuffer(data) ? parseJson(data.toString("utf8")) : undefined;
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return undefined;
  }
  if (message.type === "cancel") {
    return { type: "cancel" };
  }
  if (message.type === "permission") {
    return parsePermission(message);
  }
  const text = message.type === "prompt" && "text" in message ? message.text : undefined;
  return typeof text === "string" && text.trim() !== "" ? { type: "prompt", text } : undefined;
}

/** What the server sends over the session's WebSocket. */
type ServerMessage =
  | { type: "session"; session: SessionView }
  | { type: "prompt_rejected"; reason: string }
  | { type: "permission_rejected"; reason: "not_found" }
  | { type: "invalid_command" };

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

async function prompt(
  socket: WebSocket,
  sessions: AgentSessions,
  { sessionId, text }: { sessionId: string; text: string },
) {
  const outcome = await sessions.prompt(sessionId, text);
  if (outcome !== "accepted") {
    send(socket, { type: "prompt_rejected", reason: outcome });
  }
}

async function answerPermission(
  socket: WebSocket,
  sessions: AgentSessions,
  { sessionId, requestId, optionId }: { sessionId: string; requestId: string; optionId: string },
) {
  const outcome = await sessions.answerPermission(sessionId, { requestId, optionId });
  if (outcome !== "accepted") {
    send(socket, { type: "permission_rejected", reason: outcome });
  }
}

interface RouteDependencies {
  runtime: AgentRuntime;
  sessions: AgentSessions;
  /** Receives a failure of a browser command; the socket stays open for the next one. */
  onError: (error: unknown) => void;
}

/** Carries out one browser command; a failure goes to `onError` and the socket stays open. */
async function handle(
  socket: WebSocket,
  { sessionId, data }: { sessionId: string; data: unknown },
  { sessions, onError }: Pick<RouteDependencies, "sessions" | "onError">,
) {
  const command = parseCommand(data);
  try {
    if (command === undefined) {
      send(socket, { type: "invalid_command" });
    } else if (command.type === "cancel") {
      await sessions.cancel(sessionId);
    } else if (command.type === "permission") {
      await answerPermission(socket, sessions, { sessionId, ...command });
    } else {
      await prompt(socket, sessions, { sessionId, text: command.text });
    }
  } catch (error) {
    onError(error);
  }
}

/** Serves one browser connection to a session: the view at once and after each change. */
async function serveEvents(
  socket: WebSocket,
  sessionId: string,
  dependencies: Pick<RouteDependencies, "sessions" | "onError">,
) {
  const { sessions } = dependencies;
  // Handlers attach before the first await, so no message from the browser is lost.
  const unsubscribe = sessions.subscribe(sessionId, (session) => {
    send(socket, { type: "session", session });
  });
  socket.on("close", unsubscribe);
  socket.on("message", (data) => {
    void handle(socket, { sessionId, data }, dependencies);
  });
  const session = await sessions.view(sessionId);
  if (session === undefined) {
    socket.close(4404, "session_not_found");
  } else {
    send(socket, { type: "session", session });
  }
}

function registerStartRoute(
  server: FastifyInstance,
  { runtime, sessions }: Pick<RouteDependencies, "runtime" | "sessions">,
) {
  const body = {
    type: "object",
    properties: { kind: { type: "string", enum: sessionKinds }, agent: { type: "string" } },
    required: ["kind", "agent"],
  } as const;
  server.post<{ Body: { kind: SessionKind; agent: string } }>(
    "/api/sessions",
    { schema: { body } },
    async (request, reply) => {
      const { kind, agent } = request.body;
      const agents = await runtime.listAgents();
      const offered = agents.find((availability) => availability.agent === agent);
      if (offered?.available !== true) {
        return reply.code(400).send({ error: "agent_unavailable" });
      }
      return reply.code(201).send(await sessions.start({ kind, agent }));
    },
  );
}

/**
 * The HTTP and WebSocket API of agents and AgentSessions:
 * - `GET /api/agents`: the agents and whether each is available, with the reason when not.
 * - `POST /api/sessions` `{ kind, agent }`: creates a session and starts its agent.
 * - `GET /api/sessions`: every session, the newest first; `GET /api/sessions/:id`: its view.
 * - WebSocket `/api/sessions/:id/events`: sends `{ type: "session", session }` at once and after
 *   each change; takes `{ type: "prompt", text }`, `{ type: "cancel" }` and
 *   `{ type: "permission", requestId, optionId }`, the Candidate's answer to the agent's permission
 *   request. A refused answer gets `{ type: "permission_rejected", reason: "not_found" }`.
 */
export function registerAgentSessionRoutes(
  server: FastifyInstance,
  { runtime, sessions, onError }: RouteDependencies,
): void {
  server.get("/api/agents", async () => runtime.listAgents());
  registerStartRoute(server, { runtime, sessions });
  server.get("/api/sessions", async () => sessions.list());
  server.get<{ Params: { id: string } }>(
    "/api/sessions/:id",
    { schema: { params: sessionParams } },
    async (request, reply) => {
      const view = await sessions.view(request.params.id);
      return view ?? reply.code(404).send({ error: "session_not_found" });
    },
  );
  server.get<{ Params: { id: string } }>(
    "/api/sessions/:id/events",
    { websocket: true, schema: { params: sessionParams } },
    async (socket, request) => serveEvents(socket, request.params.id, { sessions, onError }),
  );
}
