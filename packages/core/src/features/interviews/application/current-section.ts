// `set_current_section`: the Section the interview is in now; the candidates come from it.
import { change } from "./context.ts";
import type { Context } from "./context.ts";
import {
  assertRunning,
  InterviewToolError,
  interviewOf,
  planOf,
  selected,
} from "./tool-session.ts";

export async function setSection(
  context: Context,
  sessionId: string,
  { sectionId }: { sectionId: string },
): Promise<string> {
  const found = await interviewOf(context, sessionId);
  return change(context, found.id, async () => {
    const interview = await interviewOf(context, sessionId);
    assertRunning(interview);
    const section = selected(await planOf(context, interview), interview).find(
      (entry) => entry.id === sectionId,
    );
    if (section === undefined) {
      throw new InterviewToolError(
        "This Section is not selected for the mock interview: use a Section id from get_brief.",
      );
    }
    await context.dependencies.repository.update(interview.id, { currentSectionId: section.id });
    return `The current Section is now «${section.name}». Pick its questions with next_question_candidates.`;
  });
}
