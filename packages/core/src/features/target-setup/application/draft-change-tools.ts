// The MCP tools that read the draft of changes and take changes back. Each acts only on the
// Target of its session.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import { sessionTarget } from "./draft-tools.ts";
import type { TargetSetup } from "./target-setup.ts";

export function getDraft(setup: TargetSetup) {
  return sessionTool({
    name: "get_draft",
    description:
      "Returns the draft of changes of this session's Target: every change not applied yet, in the order of recording, with its id.",
    input: z.strictObject({}),
    run: async (_input, session) => {
      const changes = await setup.draft(sessionTarget(session));
      if (changes === undefined) {
        throw new Error("Target not found");
      }
      return JSON.stringify({ changes });
    },
  });
}

export function removeDraftChange(setup: TargetSetup) {
  return sessionTool({
    name: "remove_draft_change",
    description:
      "Removes one change from the draft of changes by its id from get_draft, as the Candidate's ✕ does. The other changes stay.",
    input: z.strictObject({ id: z.uuid() }),
    run: async ({ id }, session) => {
      if (!(await setup.removeChange(sessionTarget(session), id))) {
        throw new Error(`The draft has no change ${id}`);
      }
      const changes = (await setup.draft(sessionTarget(session))) ?? [];
      return JSON.stringify({ removed: id, draftChanges: changes.length });
    },
  });
}

export function discardDraft(setup: TargetSetup) {
  return sessionTool({
    name: "discard_draft",
    description:
      "Removes every change from the draft of changes, as the Candidate's «Отменить изменения» does. The Target stays as it is.",
    input: z.strictObject({}),
    run: async (_input, session) =>
      JSON.stringify({ discarded: await setup.discard(sessionTarget(session)) }),
  });
}
