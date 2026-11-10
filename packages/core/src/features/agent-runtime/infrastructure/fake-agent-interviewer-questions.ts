// How the fake interviewer chooses and shows the next question; the markers of the Candidate's
// answer steer it. See fake-agent-interviewer.ts for the whole mode.

/** What one interviewer turn can do: call a tool of the session's MCP server and send text. */
export interface InterviewerActions {
  /** The fake agent's own session id. */
  readonly sessionId: string;
  /** Calls the tool with the arguments; resolves with its text, an error text included. */
  readonly call: (name: string, input: object) => Promise<string>;
  /** Sends text in chunks without ending the turn. */
  readonly say: (text: string) => Promise<void>;
}

/** The hint the fake interviewer sends right after it shows a question. */
const hintAfterQuestion = "Подсказка до ответа: вспомните про пример из практики.";

/** The Topic of the question each session showed last. */
const lastTopics = new Map<string, string>();

/** How many key points the reference answer of each session's shown question has; 0 without one. */
const referencePoints = new Map<string, number>();

/** The number of key points in the result of present_question; 0 without a reference answer. */
const pointsIn = (result: string) => result.match(/^\d+\. /gmu)?.length ?? 0;

/** The key points of the reference answer of the session's shown question; 0 without one. */
export const referencePointCount = (sessionId: string) => referencePoints.get(sessionId) ?? 0;

/** Remembers the reference answer of a question that a continuation shows again. */
export function rememberReferencePoints(sessionId: string, count: number): void {
  referencePoints.set(sessionId, count);
}

interface Candidate {
  readonly id: string;
  readonly format: string;
  readonly topicId: string;
}

function isCandidate(candidate: unknown): candidate is Candidate {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    "id" in candidate &&
    typeof candidate.id === "string" &&
    "format" in candidate &&
    typeof candidate.format === "string" &&
    "topicId" in candidate &&
    typeof candidate.topicId === "string"
  );
}

/** The candidates in the tool's JSON; null when the tool refused with an error text. */
function candidatesOf(text: string): readonly Candidate[] | null {
  if (!text.startsWith("{")) {
    return null;
  }
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("candidates" in parsed) ||
    !Array.isArray(parsed.candidates)
  ) {
    throw new Error(`Unexpected candidates: ${text}`);
  }
  return parsed.candidates.filter((candidate: unknown) => isCandidate(candidate));
}

/** What the next question is: its format, a Deeper question's parent, or a made-up question. */
export interface NextQuestion {
  readonly format?: "open" | "quiz";
  readonly parentAttemptId?: string | undefined;
  readonly madeUp?: boolean;
}

/** Shows the question, remembers its Topic and sends the hint the app must hide. */
async function show(actions: InterviewerActions, input: object, topicId: string): Promise<void> {
  const result = await actions.call("present_question", input);
  referencePoints.set(actions.sessionId, pointsIn(result));
  lastTopics.set(actions.sessionId, topicId);
  await actions.say(hintAfterQuestion);
}

/** A new question in the Topic of the last one, for `[new]` or a Deeper question without candidates. */
async function showMadeUp(
  actions: InterviewerActions,
  { text, parentAttemptId }: { text: string; parentAttemptId: string | undefined },
): Promise<boolean> {
  const topicId = lastTopics.get(actions.sessionId);
  if (topicId === undefined) {
    return false;
  }
  const parent = parentAttemptId === undefined ? {} : { parentAttemptId };
  const reason = "Фейковый интервьюер: среди кандидатов нет подходящего.";
  await show(actions, { text, topicId, reason, ...parent }, topicId);
  return true;
}

/**
 * The candidates of the current Section, or of the last Topic for a Deeper question; null after
 * the refusal, which the fake agent tells.
 */
async function candidatesFor(
  actions: InterviewerActions,
  parentAttemptId: string | undefined,
): Promise<readonly Candidate[] | null> {
  const topicId = parentAttemptId === undefined ? undefined : lastTopics.get(actions.sessionId);
  const result = await actions.call(
    "next_question_candidates",
    topicId === undefined ? {} : { topicId },
  );
  const candidates = candidatesOf(result);
  if (candidates === null) {
    await actions.say(`Кандидаты не получены: ${result}`);
  }
  return candidates;
}

/**
 * The next question: the first candidate of the format, open by default, or the first one. A
 * Deeper question takes the candidates of the last Topic and names its parent Attempt.
 */
export async function presentNext(
  actions: InterviewerActions,
  { format = "open", parentAttemptId, madeUp = false }: NextQuestion = {},
): Promise<void> {
  if (
    madeUp &&
    (await showMadeUp(actions, { text: "Фейковый вопрос: придуман без базы.", parentAttemptId }))
  ) {
    return;
  }
  const candidates = await candidatesFor(actions, parentAttemptId);
  if (candidates === null) {
    return;
  }
  const next = candidates.find((candidate) => candidate.format === format) ?? candidates[0];
  if (next !== undefined) {
    const parent = parentAttemptId === undefined ? {} : { parentAttemptId };
    await show(actions, { questionId: next.id, ...parent }, next.topicId);
  } else if (
    parentAttemptId === undefined ||
    !(await showMadeUp(actions, { text: "Фейковый вопрос глубже по теме.", parentAttemptId }))
  ) {
    await actions.say("Вопросов больше нет.");
  }
}

/** The ids of the brief's Sections and its current Section; empty for another text. */
function briefSections(brief: string): { ids: readonly string[]; current: string | null } {
  const parsed: unknown = JSON.parse(brief);
  if (typeof parsed !== "object" || parsed === null) {
    return { ids: [], current: null };
  }
  const sections: unknown = Reflect.get(parsed, "sections");
  const mockInterview: unknown = Reflect.get(parsed, "mockInterview");
  const ids = (Array.isArray(sections) ? sections : []).flatMap((section: unknown) =>
    typeof section === "object" &&
    section !== null &&
    "id" in section &&
    typeof section.id === "string"
      ? [section.id]
      : [],
  );
  const current: unknown =
    typeof mockInterview === "object" && mockInterview !== null
      ? Reflect.get(mockInterview, "currentSectionId")
      : null;
  return { ids, current: typeof current === "string" ? current : null };
}

/** The id of the Section after the current one in the brief, if there is one. */
function nextSectionId(brief: string): string | undefined {
  const { ids, current } = briefSections(brief);
  const index = current === null ? -1 : ids.indexOf(current);
  return index === -1 ? undefined : ids[index + 1];
}

/** `[section]`: moves to the Section after the current one in the brief. */
export async function moveToNextSection(actions: InterviewerActions): Promise<void> {
  const sectionId = nextSectionId(await actions.call("get_brief", {}));
  if (sectionId !== undefined) {
    await actions.call("set_current_section", { sectionId });
  }
}
