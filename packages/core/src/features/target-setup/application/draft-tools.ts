// The MCP tools that record changes in the draft of changes and apply it. Each acts only on the
// Target of its session. A new operation gets its tool here and its case in `domain/draft.ts`.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { ToolSession } from "../../../shared/mcp/index.ts";
import { planProblems } from "../domain/draft.ts";
import type { DraftOperation } from "../domain/draft.ts";
import { levels, sectionKinds, tones } from "../domain/target-values.ts";
import type { RecordOutcome, TargetSetup } from "./target-setup.ts";

export function sessionTarget(session: ToolSession): string {
  if (session.targetId === undefined || session.targetId === null) {
    throw new Error("This session has no Target");
  }
  return session.targetId;
}

const unappliedNote =
  "The Target is unchanged until the draft is applied. Apply only after the Candidate agrees.";

/** The recorded change for the agent; throws when nothing was recorded. */
export function recordedChange(recorded: RecordOutcome) {
  switch (recorded.outcome) {
    case "recorded": {
      const { change, size, replaced } = recorded;
      return {
        recorded: change.id,
        ...(replaced.length === 0 ? {} : { replaced }),
        draftChanges: size,
        note: unappliedNote,
      };
    }
    case "not_found": {
      throw new Error("Target not found");
    }
    case "refused": {
      throw new Error(recorded.problems.join(" "));
    }
    default: {
      return recorded satisfies never;
    }
  }
}

/** Records the operation and tells the agent the size of the draft. */
export async function recordIn(
  setup: TargetSetup,
  session: ToolSession,
  operation: DraftOperation,
) {
  return JSON.stringify(recordedChange(await setup.record(sessionTarget(session), operation)));
}

export function updateTarget(setup: TargetSetup) {
  return sessionTool({
    name: "update_target",
    description:
      "Records a change of the Target's name, level, tone or language of the Interviewer in the draft of changes. Give only the fields to change. The Target stays unchanged until the draft is applied.",
    input: z.strictObject({
      name: z.string().trim().min(1).optional(),
      level: z.enum(levels).optional(),
      tone: z.enum(tones).optional(),
      language: z.string().trim().min(1).optional(),
    }),
    run: async (fields, session) => {
      const given = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(given).length === 0) {
        throw new Error("Give at least one field to change");
      }
      return recordIn(setup, session, { type: "update_target", ...given });
    },
  });
}

export function setInterviewPlan(setup: TargetSetup) {
  return sessionTool({
    name: "set_interview_plan",
    description:
      "Records the whole Interview plan in the draft of changes: every Section in order, with its kind, short grading criteria and Topics by name. It replaces the previous plan, so it also deletes, reorders and switches Sections; it also replaces the earlier plan change of the draft and keeps that change's `renameTopics`. A Section with the name of an existing one keeps it. An omitted `gradingCriteria`, `enabled` or `topics` keeps the Section's current value; a new Section gets no criteria and no Topics and is enabled. Applying creates new Topics and reuses a Topic of the same name; a Topic left out of the plan keeps its Questions. `renameTopics` renames a Topic, keeping its Questions, or merges it into the existing Topic named `to`; name the Topic by its new name in the plan. The Target stays unchanged until the draft is applied.",
    input: z.strictObject({
      sections: z
        .array(
          z.strictObject({
            name: z.string().trim().min(1),
            kind: z.enum(sectionKinds),
            gradingCriteria: z.string().trim().optional(),
            enabled: z.boolean().optional(),
            topics: z.array(z.string().trim().min(1)).optional(),
          }),
        )
        .min(1),
      renameTopics: z
        .array(z.strictObject({ from: z.string().trim().min(1), to: z.string().trim().min(1) }))
        .default([]),
    }),
    run: async ({ sections, renameTopics }, session) => {
      const problems = planProblems(sections);
      if (problems.length > 0) {
        throw new Error(problems.join(" "));
      }
      return recordIn(setup, session, {
        type: "set_interview_plan",
        sections,
        ...(renameTopics.length === 0 ? {} : { renameTopics }),
      });
    },
  });
}

export function applyChanges(setup: TargetSetup) {
  return sessionTool({
    name: "apply_changes",
    description:
      "Applies the whole draft of changes to the Target at once. Call it only after the Candidate explicitly agrees, such as «применяй». On problems nothing changes and the tool reports them.",
    input: z.strictObject({}),
    run: async (_input, session) => {
      const applied = await setup.apply(sessionTarget(session));
      switch (applied.outcome) {
        case "applied": {
          return `Applied ${applied.changes} changes. The Target now: ${JSON.stringify(applied.target)}`;
        }
        case "not_found": {
          throw new Error("Target not found");
        }
        case "empty": {
          throw new Error("The draft is empty: there is nothing to apply");
        }
        case "invalid": {
          throw new Error(applied.problems.join(" "));
        }
        default: {
          return applied satisfies never;
        }
      }
    },
  });
}
