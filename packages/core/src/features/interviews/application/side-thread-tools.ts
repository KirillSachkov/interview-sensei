// The MCP tools of the `side-thread` session kind that `interviews` owns (#80). The Side thread
// only reads: no tool here records Attempts, changes Grades or changes the plan.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { SessionTool } from "../../../shared/mcp/index.ts";
import type { Interviews } from "./interviews.ts";

export function sideThreadTools({ sideThreadBrief }: Interviews): readonly SessionTool[] {
  return [
    sessionTool({
      name: "get_brief",
      description:
        "Returns the Handoff brief of this side thread as JSON: the Target, the question with its Section and Topic, the Candidate's answer and Follow-ups when there are any, the selected fragment and the Candidate's question. It holds no Grade unless the Candidate opened the Debrief. Call it once at the start.",
      input: z.strictObject({}),
      run: async (_input, session) => sideThreadBrief(session.sessionId),
    }),
  ];
}
