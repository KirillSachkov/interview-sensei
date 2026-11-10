// Unit tests of the continuation summary (#84): what the agent of a Mock interview gets in
// `get_brief` after a pause, built from the server's own records. They sit at the slice root:
// domain-is-pure keeps even test imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import { continuationSummary } from "./domain/continuation.ts";
import type { AskedQuestion, Attempt, MockInterview } from "./domain/interview.ts";

const interview = {
  status: "paused",
  limitMinutes: 30,
  startedAt: "2026-03-01T10:00:00.000Z",
  pausedAt: "2026-03-01T10:12:00.000Z",
  pausedMs: 0,
  currentSectionId: "section-go",
} satisfies Partial<MockInterview>;

function asked(position: number, changes: Partial<AskedQuestion> = {}): AskedQuestion {
  return {
    id: `asked-${position}`,
    interviewId: "interview",
    position,
    questionId: `question-${position}`,
    topicId: "topic-go",
    sectionId: "section-go",
    text: `Вопрос ${position + 1}`,
    format: "open",
    options: [],
    correctOptionIds: [],
    referenceAnswer: null,
    parentAttemptId: null,
    presentedAt: "2026-03-01T10:01:00.000Z",
    answer: {
      text: `Ответ ${position + 1}`,
      optionIds: [],
      skipped: false,
      answeredAt: "2026-03-01T10:02:00.000Z",
    },
    followUps: [],
    hinted: false,
    debriefOpened: false,
    chatPosition: 0,
    ...changes,
  };
}

function attempt(position: number, grade: Attempt["grade"]): Attempt {
  return {
    id: `attempt-${position}`,
    interviewId: "interview",
    askedQuestionId: `asked-${position}`,
    grade,
    gradedBy: "agent",
    gaps: `Пробелы ${position + 1}`,
    justification: "Обоснование",
    strongAnswer: "Сильный ответ",
    hinted: false,
    referencePoints: null,
    referenceDisagreement: null,
    recordedAt: "2026-03-01T10:03:00.000Z",
  };
}

const now = "2026-03-01T11:00:00.000Z";

describe("continuation summary", () => {
  it("gives the current Section and the time left as it stood at the pause", () => {
    const summary = continuationSummary(interview, { asked: [], attempts: [], disputes: [], now });

    expect(summary).toMatchObject({
      currentSectionId: "section-go",
      timeLeftMinutes: 18,
      overtime: false,
      askedQuestions: [],
      presentedQuestion: null,
    });
  });

  it("gives no time left without a limit", () => {
    const summary = continuationSummary(
      { ...interview, limitMinutes: null },
      { asked: [], attempts: [], disputes: [], now },
    );

    expect(summary).toMatchObject({ timeLeftMinutes: null, overtime: false });
  });

  it("lists the asked questions in order with the answers, Follow-ups and Grades after Disputes", () => {
    const followUps = [{ question: "Пример?", answer: "Вот пример", askedAt: now }];
    const summary = continuationSummary(interview, {
      asked: [asked(0, { followUps }), asked(1, { parentAttemptId: "attempt-0" })],
      attempts: [attempt(0, 3), attempt(1, 1)],
      disputes: [
        {
          id: "dispute",
          interviewId: "interview",
          attemptId: "attempt-1",
          grade: 2,
          reason: "Ответ полнее",
          disputedAt: now,
        },
      ],
      now,
    });

    expect(summary.askedQuestions).toStrictEqual([
      {
        number: 1,
        questionId: "question-0",
        topicId: "topic-go",
        sectionId: "section-go",
        text: "Вопрос 1",
        format: "open",
        parentAttemptId: null,
        answer: { text: "Ответ 1", chosenOptions: [], skipped: false },
        followUps: [{ question: "Пример?", answer: "Вот пример" }],
        attempt: { id: "attempt-0", grade: 3, gradedBy: "agent", gaps: "Пробелы 1" },
      },
      {
        number: 2,
        questionId: "question-1",
        topicId: "topic-go",
        sectionId: "section-go",
        text: "Вопрос 2",
        format: "open",
        parentAttemptId: "attempt-0",
        answer: { text: "Ответ 2", chosenOptions: [], skipped: false },
        followUps: [],
        attempt: { id: "attempt-1", grade: 2, gradedBy: "agent", gaps: "Пробелы 2" },
      },
    ]);
    expect(summary.presentedQuestion).toBeNull();
  });

  it("gives the presented question that waits for the Candidate's answer apart from the asked ones", () => {
    const summary = continuationSummary(interview, {
      asked: [asked(0), asked(1, { answer: null })],
      attempts: [attempt(0, 2)],
      disputes: [],
      now,
    });

    expect(summary.askedQuestions).toHaveLength(1);
    expect(summary.presentedQuestion).toMatchObject({
      number: 2,
      questionId: "question-1",
      text: "Вопрос 2",
      answer: null,
      waitingFor: "answer",
    });
  });

  it("tells that the presented question waits for the answer to its Follow-up", () => {
    const followUps = [{ question: "Пример?", answer: null, askedAt: now }];

    const summary = continuationSummary(interview, {
      asked: [asked(0, { followUps })],
      attempts: [],
      disputes: [],
      now,
    });

    expect(summary.presentedQuestion).toMatchObject({
      followUps: [{ question: "Пример?", answer: null }],
      waitingFor: "follow_up_answer",
    });
  });

  it("tells that the answered presented question waits for its Attempt", () => {
    const summary = continuationSummary(interview, {
      asked: [asked(0)],
      attempts: [],
      disputes: [],
      now,
    });

    expect(summary.presentedQuestion).toMatchObject({
      answer: { text: "Ответ 1" },
      waitingFor: "attempt",
    });
  });

  it("gives a quiz answer as the texts of the chosen options and «Не знаю» as skipped", () => {
    const quiz = asked(0, {
      format: "quiz",
      options: [
        { id: "a", text: "Канал" },
        { id: "b", text: "Мьютекс" },
      ],
      correctOptionIds: ["a"],
      answer: { text: null, optionIds: ["b"], skipped: false, answeredAt: now },
    });
    const skipped = asked(1, {
      answer: { text: null, optionIds: [], skipped: true, answeredAt: now },
    });

    const summary = continuationSummary(interview, {
      asked: [quiz, skipped],
      attempts: [attempt(0, 0), attempt(1, 0)],
      disputes: [],
      now,
    });

    expect(summary.askedQuestions.map((question) => question.answer)).toStrictEqual([
      { text: null, chosenOptions: ["Мьютекс"], skipped: false },
      { text: null, chosenOptions: [], skipped: true },
    ]);
    expect(JSON.stringify(summary)).not.toContain("correctOptionIds");
  });
});
