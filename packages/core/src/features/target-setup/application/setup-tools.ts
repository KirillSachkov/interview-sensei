import { discardDraft, getDraft, removeDraftChange } from "./draft-change-tools.ts";
import { applyChanges, setInterviewPlan, setTopicImportance, updateTarget } from "./draft-tools.ts";
import { savePreference } from "./preference-tool.ts";
import { addQuestions, editQuestions } from "./question-tools.ts";
import type { TargetSetup } from "./target-setup.ts";

/** The MCP tools of the Target setup session that read, change and apply the draft of changes. */
export function draftTools(setup: TargetSetup) {
  return [
    updateTarget(setup),
    setInterviewPlan(setup),
    setTopicImportance(setup),
    savePreference(setup),
    addQuestions(setup),
    editQuestions(setup),
    getDraft(setup),
    removeDraftChange(setup),
    applyChanges(setup),
    discardDraft(setup),
  ];
}
