// The rule «не подтверждён» of spec #47 for the draft of changes: a Question that the Candidate
// applies through the draft is confirmed.
import type { SetupQuestionEdit } from "./ports.ts";

/**
 * Whether the draft's edit confirms a made-up Question: the Candidate applies its new text or
 * Topic, or rates it useful, as 👍 does. Hiding it or another rating leaves the mark.
 */
export function confirms(edit: Omit<SetupQuestionEdit, "id">): boolean {
  return edit.text !== undefined || edit.topicId !== undefined || edit.rating === "useful";
}
