import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  goalSetup,
  goalSetupMessage,
  goalSetupPath,
  goalSetupTurn,
  goalSetupTurnPath,
} from "@sensei/contracts";
import { GoalSetupModelError } from "../modules/agent-execution/index.js";
import {
  GoalSetupConflict,
  type goalSetups,
  type RunGoalSetup,
} from "../modules/goals-and-scenarios/index.js";

const routeId = z.uuid().transform((uuid) => uuid.toLowerCase());
const workspaceParams = z.object({ workspaceId: routeId });
const turnParams = workspaceParams.extend({ turnId: routeId });
const turnPath = goalSetupTurnPath(":workspaceId", ":turnId");

export function registerGoalSetup(
  api: FastifyInstance,
  origin: string,
  sessionWorkspace: (secret: string | undefined) => Promise<string | undefined>,
  setups: ReturnType<typeof goalSetups>,
  run: RunGoalSetup,
) {
  const open = async (secret: string | undefined, workspaceId: string) =>
    setups.open(await sessionWorkspace(secret), workspaceId);

  api.get(goalSetupPath(":workspaceId"), async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const params = workspaceParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send();
    const setup = await open(request.cookies["guest"], params.data.workspaceId);
    if (!setup) return reply.code(404).send();
    return reply.send(goalSetup.parse(await setup.read()));
  });

  api.get(turnPath, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const params = turnParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send();
    const setup = await open(request.cookies["guest"], params.data.workspaceId);
    const turn = await setup?.find(params.data.turnId);
    if (!turn) return reply.code(404).send();
    return reply.send(goalSetupTurn.parse(turn));
  });

  api.put(turnPath, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (request.headers.origin !== origin) return reply.code(403).send();
    const params = turnParams.safeParse(request.params);
    const body = goalSetupMessage.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send();
    const setup = await open(request.cookies["guest"], params.data.workspaceId);
    if (!setup) return reply.code(404).send();
    try {
      const turn = await setup.submit(
        { turnId: params.data.turnId, ...body.data },
        run,
      );
      return reply.send(goalSetupTurn.parse(turn));
    } catch (error) {
      if (error instanceof GoalSetupConflict) return reply.code(409).send();
      if (error instanceof GoalSetupModelError) return reply.code(503).send();
      throw error;
    }
  });
}
