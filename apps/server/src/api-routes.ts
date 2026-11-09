// The HTTP and WebSocket API under `/api`: server.ts registers it after the request guards.
import type { FastifyInstance } from "fastify";

import { registerAgentSessionRoutes } from "./agent-session-routes.ts";
import { archiveGuard } from "./archive-guard.ts";
import type { Features } from "./composition.ts";
import { registerInterviewRoutes } from "./interview-routes.ts";
import { registerProgressRoutes } from "./progress-routes.ts";
import { registerSourceRoutes } from "./source-routes.ts";
import { registerTargetRoutes } from "./target-routes.ts";
import { registerTargetSetupRoutes } from "./target-setup-routes.ts";

/** The HTTP and WebSocket API under `/api`. */
export function registerApi(server: FastifyInstance, features: Features) {
  server.get("/api/health", features.health);
  const guarded = { ...features, archiveGuard: archiveGuard(features.targets) };
  registerTargetRoutes(server, guarded);
  registerTargetSetupRoutes(server, guarded);
  registerSourceRoutes(server, features);
  registerInterviewRoutes(server, guarded);
  registerProgressRoutes(server, features);
  registerAgentSessionRoutes(server, {
    runtime: features.runtime,
    sessions: features.sessions,
    onError: (error) => {
      server.log.error({ err: error }, "A session command from the browser failed");
    },
  });
}
