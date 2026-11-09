import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { Targets } from "./targets.ts";

export function getTarget(targets: Targets) {
  return sessionTool({
    name: "get_target",
    description:
      "Returns this session's Target, its ordered Interview plan, Topics with Question counts, and active Preferences. Call it before working on a Target. The Target is fixed by the session.",
    input: z.strictObject({}),
    run: async (_input, session) => {
      if (session.targetId === undefined || session.targetId === null) {
        return "This session has no Target";
      }
      const target = await targets.get(session.targetId);
      return target === undefined ? "Target not found" : JSON.stringify(target);
    },
  });
}
