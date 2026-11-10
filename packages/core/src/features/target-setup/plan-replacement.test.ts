// Spec #45, seam 2: a new Interview plan in the draft of changes replaces the earlier plan changes
// and keeps their Topic renames (owner's decision after the live check, 2026-11-09) and their
// Section renames (issue #88).
import { describe, expect, it } from "vitest";

import type { DraftChange, DraftOperation } from "./domain/draft.ts";
import { planReplacement } from "./domain/draft-plan.ts";

type Plan = Extract<DraftOperation, { type: "set_interview_plan" }>;

const go = { name: "Go", kind: "topics", topics: ["Планировщик"] } as const;

function change(id: string, operation: DraftOperation): DraftChange {
  return { id, targetId: "target-1", operation, createdAt: "2026-11-09T10:00:00.000Z" };
}

const tone = change("change-1", { type: "update_target", tone: "strict" });
const firstPlan = change("change-2", {
  type: "set_interview_plan",
  sections: [go],
  renameTopics: [{ from: "Горутины", to: "Планировщик" }],
});

describe("a new plan in the draft", () => {
  it("replaces the earlier plan changes and leaves the other changes", () => {
    const plan: Plan = { type: "set_interview_plan", sections: [go] };

    const { replaced } = planReplacement([tone, firstPlan], plan);

    expect(replaced).toStrictEqual(["change-2"]);
  });

  it("keeps the Topic renames of the replaced plan before its own", () => {
    const plan: Plan = {
      type: "set_interview_plan",
      sections: [go],
      renameTopics: [{ from: "Каналы", to: "Конкурентность" }],
    };

    const { operation } = planReplacement([firstPlan], plan);

    expect(operation.renameTopics).toStrictEqual([
      { from: "Горутины", to: "Планировщик" },
      { from: "Каналы", to: "Конкурентность" },
    ]);
  });

  it("makes a rename that the new plan restates once", () => {
    const plan: Plan = {
      type: "set_interview_plan",
      sections: [go],
      renameTopics: [{ from: "горутины ", to: "планировщик" }],
    };

    const { operation } = planReplacement([firstPlan], plan);

    expect(operation.renameTopics).toStrictEqual([{ from: "Горутины", to: "Планировщик" }]);
  });

  it("keeps the Section renames of the replaced plan before its own", () => {
    const renamed = change("change-3", {
      type: "set_interview_plan",
      sections: [go],
      renameSections: [{ from: "Go и конкурентность", to: "Go" }],
    });
    const plan: Plan = {
      type: "set_interview_plan",
      sections: [{ ...go, name: "Golang" }],
      renameSections: [{ from: "Go", to: "Golang" }],
    };

    const { operation } = planReplacement([renamed], plan);

    expect(operation.renameSections).toStrictEqual([
      { from: "Go и конкурентность", to: "Go" },
      { from: "Go", to: "Golang" },
    ]);
  });

  it("records the plan as it is when the draft has no plan", () => {
    const plan: Plan = { type: "set_interview_plan", sections: [go] };

    expect(planReplacement([tone], plan)).toStrictEqual({ replaced: [], operation: plan });
  });
});
