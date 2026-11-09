// The MCP tools that add and edit Questions through the draft of changes. Each acts only on the
// Target of its session.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import { recordedChange, recordIn, sessionTarget } from "./draft-tools.ts";
import type { TargetSetup } from "./target-setup.ts";

const levels = ["junior", "middle", "senior"] as const;
const ratings = ["useful", "irrelevant", "wrong"] as const;

const newQuestion = z.strictObject({
  topic: z.string().trim().min(1),
  text: z.string().trim().min(1),
  format: z.enum(["open", "quiz"]).default("open"),
  options: z
    .array(z.strictObject({ id: z.string().trim().min(1), text: z.string().trim().min(1) }))
    .default([]),
  correctOptionIds: z.array(z.string().trim().min(1)).default([]),
  level: z.enum(levels).nullable().default(null),
});

export function addQuestions(setup: TargetSetup) {
  return sessionTool({
    name: "add_questions",
    description:
      "Records new Questions in the draft of changes, each with its Topic by name; applying creates a missing Topic. A quiz has options with ids and the ids of the correct ones. Without `level` a Question takes the Target's level. The tool leaves out duplicates of the Target's Questions and of the draft by text, ignoring case, spaces and punctuation, and returns them in `duplicates`. Look for duplicates in meaning with search_questions first. The Target stays unchanged until the draft is applied.",
    input: z.strictObject({ questions: z.array(newQuestion).min(1) }),
    run: async ({ questions }, session) => {
      const filtered = await setup.addQuestions(sessionTarget(session), questions);
      if (filtered === null) {
        throw new Error("Target not found");
      }
      const { recorded, added, duplicates } = filtered;
      return JSON.stringify({
        ...(recorded === null ? { recorded: null } : recordedChange(recorded)),
        added: added.map(({ id, text }) => ({ id, text })),
        duplicates: duplicates.map((question) => question.text),
      });
    },
  });
}

export function editQuestions(setup: TargetSetup) {
  return sessionTool({
    name: "edit_questions",
    description:
      "Records edits of the Target's Questions in the draft of changes, by the ids from search_questions or add_questions: rephrase with `text`, move to the Topic of another name with `topic`, hide or show again with `hidden`, rate with `rating` (null clears it). Give only the fields to change. The Target stays unchanged until the draft is applied.",
    input: z.strictObject({
      edits: z
        .array(
          z.strictObject({
            id: z.uuid(),
            text: z.string().trim().min(1).optional(),
            topic: z.string().trim().min(1).optional(),
            hidden: z.boolean().optional(),
            rating: z.enum(ratings).nullable().optional(),
          }),
        )
        .min(1),
    }),
    run: async ({ edits }, session) => {
      const given = edits.map(({ id, text, topic, hidden, rating }) => ({
        id,
        ...(text === undefined ? {} : { text }),
        ...(topic === undefined ? {} : { topic }),
        ...(hidden === undefined ? {} : { hidden }),
        ...(rating === undefined ? {} : { rating }),
      }));
      if (given.some((edit) => Object.keys(edit).length < 2)) {
        throw new Error("Give at least one field to change for each Question");
      }
      return recordIn(setup, session, { type: "edit_questions", edits: given });
    },
  });
}
