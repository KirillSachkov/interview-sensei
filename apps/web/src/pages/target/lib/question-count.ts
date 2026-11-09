/** «1 вопрос», «3 вопроса», «12 вопросов»: the Russian plural of a Question count. */
export function questionCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} вопросов`;
  }
  if (last === 1) {
    return `${count} вопрос`;
  }
  return last >= 2 && last <= 4 ? `${count} вопроса` : `${count} вопросов`;
}
