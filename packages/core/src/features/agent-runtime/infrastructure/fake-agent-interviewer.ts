// The fake agent's interviewer mode: it answers the template messages of a mock interview, which
// it knows by their first sentence, by calling our MCP tools, as a real interviewer would.
// - «The mock interview has started.»: `get_brief`, then the next question (see below).
// - «The Candidate answered the presented question.»: «Ответ получен.», then `record_attempt` with
//   the Grade of the marker `[grade:N]` in the answer, 2 without one. With the marker `[twice]` it
//   calls `record_attempt` once more and replies «Повторная запись: <tool result>». Then the next
//   question.
// - «The Candidate answered your Follow-up.»: «Уточнение получено.», then the same as an answer.
// - `[followup]` in an answer: `ask_follow_up` instead of `record_attempt`; a refused one gives
//   «Follow-up отклонён: <tool result>» and the Attempt.
// - `[section]`: `set_current_section` with the brief's next Section before the next question.
// - `[last]`: no next question after the Attempt, so no question waits for an answer.
// - A quiz result or «Не знаю»: «Квиз оценён: N.» or «Вопрос пропущен.», then the next question.
// - «Five minutes of the time limit are left.»: «Осталось 5 минут: веду интервью к концу.».
// - «The Candidate finished the mock interview.»: `finish_interview`, then «Итог записан.».
// The next question comes from fake-agent-interviewer-questions.ts: `[quiz]`, `[deeper]` and `[new]`
// choose a quiz, a Deeper question or a made-up one; then the hint «Подсказка до ответа: …» in the
// same turn, which the app keeps out of the chat.
// A failed step ends the turn with «Фейковый интервьюер сломался: <error>».
import { moveToNextSection, presentNext } from "./fake-agent-interviewer-questions.ts";
import type { InterviewerActions } from "./fake-agent-interviewer-questions.ts";
import { sendText } from "./fake-agent-text.ts";
import { allowedCall } from "./fake-agent-tool.ts";
import type { FakeSession } from "./fake-agent-tool.ts";

async function start(actions: InterviewerActions): Promise<void> {
  await actions.say("Начинаем мок-собеседование.");
  await actions.call("get_brief", {});
  await presentNext(actions);
}

const judgment = (grade: number) => ({
  grade,
  gaps: "Фейковый интервьюер: не хватает примера из практики.",
  justification: `Фейковый интервьюер поставил оценку из метки в ответе: ${grade}.`,
  strongAnswer: "Фейковый интервьюер: определение, ограничения и пример из практики.",
});

/** Asks the fake Follow-up; true when the app showed it, so the turn ends. */
async function followUp(actions: InterviewerActions): Promise<boolean> {
  const result = await actions.call("ask_follow_up", {
    question: "Фейковый Follow-up: приведите пример.",
  });
  if (result.startsWith("The Follow-up is shown")) {
    return true;
  }
  await actions.say(`Follow-up отклонён: ${result}`);
  return false;
}

/** Judges the answer after the note, unless the marker `[followup]` asks a Follow-up first. */
async function judge(actions: InterviewerActions, text: string, note: string): Promise<void> {
  const grade = Number(/\[grade:(?<grade>[0-3])\]/u.exec(text)?.groups?.grade ?? "2");
  await actions.say(note);
  if (text.includes("[followup]") && (await followUp(actions))) {
    return;
  }
  const recorded = await actions.call("record_attempt", judgment(grade));
  if (text.includes("[twice]")) {
    await actions.say(`Повторная запись: ${await actions.call("record_attempt", judgment(grade))}`);
  }
  await goOn(actions, text, recorded);
}

/** After the Attempt: the next Section and the next question, as the answer's markers say. */
async function goOn(actions: InterviewerActions, text: string, recorded: string): Promise<void> {
  if (text.includes("[section]")) {
    await moveToNextSection(actions);
  }
  if (text.includes("[last]")) {
    return;
  }
  await presentNext(actions, {
    format: text.includes("[quiz]") ? "quiz" : "open",
    parentAttemptId: text.includes("[deeper]") ? attemptIn(recorded) : undefined,
    madeUp: text.includes("[new]"),
  });
}

/** The Attempt id in the result of record_attempt. */
const attemptIn = (result: string) =>
  /The Attempt (?<id>[0-9a-f-]{36}) is recorded/u.exec(result)?.groups?.id;

/** The app recorded the Attempt of a quiz or «Не знаю»: a short note, then the next question. */
async function noteAndGoOn(actions: InterviewerActions, note: string): Promise<void> {
  await actions.say(note);
  await presentNext(actions);
}

const gradeIn = (text: string) => /Grade (?<grade>[0-3]) of 3/u.exec(text)?.groups?.grade ?? "?";

async function finish(actions: InterviewerActions): Promise<void> {
  await actions.call("finish_interview", {
    summary: "Фейковый интервьюер: мок завершён.",
    nextStep: "Фейковый интервьюер: повторить темы с низкой оценкой.",
  });
  await actions.say("Итог записан.");
}

/** Calls our MCP tool after the allowed permission request; resolves with its text or why not. */
async function toolText(session: FakeSession, name: string, input: object) {
  const result = await allowedCall(session, name, input);
  return result === null ? `Фейковый агент не получил разрешения на ${name}` : result.text;
}

/**
 * Runs the turn's steps; a failure becomes the turn's last text «<failure>: <error>», by default
 * the interviewer's.
 */
export function turnOf(steps: Steps, failure = "Фейковый интервьюер сломался") {
  return async (session: FakeSession) => {
    try {
      await steps({
        sessionId: session.sessionId,
        call: async (name, input) => toolText(session, name, input),
        say: async (text) => sendText(session.client, session.sessionId, text),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sendText(session.client, session.sessionId, `${failure}: ${message}`);
    }
    return { stopReason: "end_turn" as const };
  };
}

export type Steps = (actions: InterviewerActions) => Promise<void>;

/** The steps for each template message, by its first sentence; each gets the whole message. */
const turns: readonly (readonly [string, (text: string) => Steps])[] = [
  ["The mock interview has started.", () => start],
  [
    "The Candidate answered the presented question.",
    (text) => async (actions) => judge(actions, text, "Ответ получен."),
  ],
  [
    "The Candidate answered your Follow-up.",
    (text) => async (actions) => judge(actions, text, "Уточнение получено."),
  ],
  [
    "The Candidate answered the presented quiz.",
    (text) => async (actions) => noteAndGoOn(actions, `Квиз оценён: ${gradeIn(text)}.`),
  ],
  [
    "The Candidate skipped the presented question",
    () => async (actions) => noteAndGoOn(actions, "Вопрос пропущен."),
  ],
  [
    "Five minutes of the time limit are left.",
    () => async (actions) => actions.say("Осталось 5 минут: веду интервью к концу."),
  ],
  ["The Candidate finished the mock interview.", () => finish],
];

/** The interviewer's turn for a template message, or null for another prompt. */
export function interviewerTurn(text: string) {
  const found = turns.find(([sentence]) => text.startsWith(sentence));
  return found === undefined ? null : turnOf(found[1](text));
}
