import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { Progress } from "./progress.ts";

/** The MCP tool `get_progress`: the progress of the session's Target. */
export function getProgress(progress: Progress) {
  return sessionTool({
    name: "get_progress",
    description:
      "Returns the Candidate's progress on this session's Target as JSON: the Topic status of each Topic of the plan (not_started, shaky or confident), the Readiness counts over the enabled Sections, and the Topics to work on first. Topic status follows from all Attempts, with Grades corrected by the Candidate's Disputes.",
    input: z.strictObject({}),
    run: async (_input, session) => {
      if (session.targetId === undefined || session.targetId === null) {
        throw new Error("This session has no Target, so it has no progress.");
      }
      const found = await progress.target(session.targetId);
      if (found === undefined) {
        throw new Error("The session's Target no longer exists.");
      }
      return JSON.stringify(found);
    },
  });
}
