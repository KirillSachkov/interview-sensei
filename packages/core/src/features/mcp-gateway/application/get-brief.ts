// The template of a session tool: a slice defines the input schema and the run function with
// sessionTool, exports the tool from its index.ts, and the server adds it to the tool set of the
// session kinds that need it.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import { briefFor } from "../domain/brief.ts";

export const getBrief = sessionTool({
  name: "get_brief",
  description:
    "Returns the brief of this session: what the session is for and how to act in it. " +
    "Call it once at the start of the session, before the first answer.",
  input: z.object({}),
  run: (_input, session) => Promise.resolve(briefFor(session.kind)),
});
