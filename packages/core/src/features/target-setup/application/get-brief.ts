import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { SetupMessage } from "../domain/brief.ts";
import type { TargetSetup } from "./target-setup.ts";

/** The messages of the earlier sessions that the session continues; empty when it continues none. */
export type EarlierMessages = (sessionId: string) => Promise<readonly SetupMessage[]>;

/**
 * `get_brief` of the Target setup session: the mode of the session and the Target's state, and
 * the last messages of the earlier conversation when the session continues one.
 */
export function setupBrief(setup: TargetSetup, earlierMessages: EarlierMessages) {
  return sessionTool({
    name: "get_brief",
    description:
      "Returns the brief of this Target setup session: its mode (onboarding of a new draft Target, or editing), how to change the Target, the Target's current state, and the last messages of the earlier conversation when this session continues one. Call it once at the start of the session, before the first answer.",
    input: z.strictObject({}),
    run: async (_input, session) => {
      if (session.targetId === undefined || session.targetId === null) {
        return "This session has no Target";
      }
      const earlier = await earlierMessages(session.sessionId);
      return (await setup.brief(session.targetId, earlier)) ?? "Target not found";
    },
  });
}
