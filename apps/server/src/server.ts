import path from "node:path";

import { fastify } from "fastify";
import type { FastifyInstance } from "fastify";

import { registerApi } from "./api-routes.ts";
import { composeFeatures, mcpRoute } from "./composition.ts";
import type { FeatureDependencies, UserEnvironment } from "./composition.ts";
import { prepare } from "./lifecycle.ts";
import { loopbackOrigin, registerMcpRoute } from "./mcp.ts";
import { registerWebApp } from "./web-app.ts";

/**
 * The repository's `skills/` for `pnpm dev` and tests; the launch command passes the built ones.
 */
const appSkillsDirectory = path.join(import.meta.dirname, "..", "..", "..", "skills");

/** `info` logs every request; `warn` keeps only problems. */
export type LogLevel = "info" | "warn";

export interface ServerDependencies extends Pick<
  FeatureDependencies,
  "clock" | "timer" | "dataDirectory"
> {
  /** The lowest level of the Fastify JSON logs; no logs when omitted, as in tests. */
  logLevel?: LogLevel;
  /**
   * Offers only the fake ACP agent, for tests and manual checks without a subscription. Tests
   * never start a real agent: they need subscriptions.
   */
  fakeAgent?: boolean;
  /**
   * The Candidate's home and env, where the server looks for Claude Code, Codex and OpenCode and
   * their logins. Without it the server offers no real agent.
   */
  userEnvironment?: UserEnvironment;
  /**
   * The application's skills that the agents get, one per session kind: those of the built app
   * for the launch command, the repository's `skills/` by default.
   */
  skillsDirectory?: string;
  /**
   * Stand-ins for the components of speech recognition: API tests pass a catalog on a local HTTP
   * server and stubs of ffmpeg and the model. The pinned real components by default.
   */
  transcription?: FeatureDependencies["transcription"];
  /** The built web app to serve beside `/api`; `pnpm dev` serves the web app from Vite instead. */
  webDirectory?: string;
  /**
   * Browser origins besides the server's own that may change state or open a WebSocket: only the
   * Vite dev server of `pnpm dev`. See acceptLocalRequestsOnly.
   */
  allowedOrigins?: readonly string[];
}

/**
 * Opens the data directory and builds the HTTP server without listening, so tests call it in
 * process. Closing the server stops the agents, then closes the storage: a final dump, then the
 * lock is released. Rejects with DataDirectoryInUseError when another server holds the data
 * directory.
 */
export async function buildServer({
  clock,
  timer,
  dataDirectory,
  logLevel,
  fakeAgent = false,
  userEnvironment,
  transcription,
  skillsDirectory = appSkillsDirectory,
  webDirectory,
  allowedOrigins = [],
}: ServerDependencies): Promise<FastifyInstance> {
  const server = fastify({
    logger: logLevel === undefined ? false : { level: logLevel },
    // Close waits for every connection before the onClose hooks stop the agents. A browser keeps
    // spare connections without a request, so close drops them instead of waiting minutes.
    forceCloseConnections: true,
  });
  const features = await composeFeatures({
    clock,
    timer,
    dataDirectory,
    skillsDirectory,
    fakeAgent,
    userEnvironment,
    transcription,
    origin: () => loopbackOrigin(server),
    log: server.log,
  });
  registerMcpRoute(server, features.mcp);
  await prepare(server, { features, allowedOrigins, exemptRoutes: [mcpRoute] });
  registerApi(server, features);
  if (webDirectory !== undefined) {
    await registerWebApp(server, webDirectory);
  }
  return server;
}
