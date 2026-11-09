// The Questions an Inbox report shows: the ones its processing added, filtered by «новые».

/**
 * The bank's Questions that the report added, in the order the agent added them; a Question
 * deleted since is left out. `onlyNew` is the filter «новые с последнего просмотра»: only the
 * Questions the Candidate has not seen.
 */
export function reportQuestions<Question extends { readonly id: string; readonly unseen: boolean }>(
  questionIds: readonly string[],
  bank: readonly Question[],
  { onlyNew }: { onlyNew: boolean },
): Question[] {
  const byId = new Map(bank.map((question) => [question.id, question]));
  return questionIds.flatMap((id) => {
    const question = byId.get(id);
    return question === undefined || (onlyNew && !question.unseen) ? [] : [question];
  });
}
