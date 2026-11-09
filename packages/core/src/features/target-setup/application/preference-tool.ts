// The MCP tool that records the Candidate's Preferences in the draft of changes.
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import { recordedChange, sessionTarget } from "./draft-tools.ts";
import type { TargetSetup } from "./target-setup.ts";

export function savePreference(setup: TargetSetup) {
  return sessionTool({
    name: "save_preference",
    description:
      "Records a Preference in the draft of changes: a rule the Candidate gave in plain language, such as «меньше определений, больше практики», with rejected Questions as examples. Without `id` it adds a Preference and needs `text`. With the `id` of a Preference from get_brief or the draft it changes only the given fields; `active: false` turns it off. The Target stays unchanged until the draft is applied.",
    input: z.strictObject({
      id: z.uuid().optional(),
      text: z.string().trim().min(1).optional(),
      rejectedQuestionIds: z.array(z.uuid()).optional(),
      active: z.boolean().optional(),
    }),
    run: async ({ id, ...fields }, session) => {
      if (id === undefined && fields.text === undefined) {
        throw new Error("A new Preference needs its text");
      }
      const given = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      const preference = id ?? randomUUID();
      const recorded = await setup.record(sessionTarget(session), {
        type: "save_preference",
        id: preference,
        ...given,
      });
      return JSON.stringify({ preference, ...recordedChange(recorded) });
    },
  });
}
