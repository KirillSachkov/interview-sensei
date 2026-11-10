// Spec #45, seam 2: how the operations of the draft of changes turn into the Target's Interview
// plan, Topics, Preferences and Questions, and which drafts cannot be applied.
import { describe, expect, it } from "vitest";

import { draftProblems, stateAfter } from "./domain/draft.ts";
import type { DraftOperation, SetupState } from "./domain/draft.ts";

const newGoroutine = {
  id: "question-1",
  topic: "Горутины",
  text: "Что такое горутина?",
  format: "open",
  options: [],
  correctOptionIds: [],
  level: "middle",
} as const;
const goroutine = { ...newGoroutine, hidden: false, rating: null, referenceAnswer: null } as const;

const target: SetupState = {
  name: "Go-разработчик",
  level: "middle",
  tone: "neutral",
  language: "ru",
  status: "active",
  sections: [
    {
      id: "section-1",
      name: "Опыт",
      kind: "conversation",
      gradingCriteria: "",
      enabled: true,
      topics: [],
    },
    {
      id: "section-2",
      name: "Go",
      kind: "topics",
      gradingCriteria: "Модель памяти",
      enabled: true,
      topics: ["Горутины", "Каналы"],
    },
    {
      id: "section-3",
      name: "Проектирование",
      kind: "design",
      gradingCriteria: "",
      enabled: true,
      topics: ["Kafka"],
    },
  ],
  topics: ["Горутины", "Каналы", "Kafka", "Мьютексы"],
  topicRenames: [],
  importance: [],
  preferences: [
    { id: "rule-1", text: "Меньше определений", rejectedQuestionIds: [], active: true },
  ],
  questions: [
    goroutine,
    { ...goroutine, id: "question-2", topic: "Мьютексы", text: "Что такое мьютекс?" },
  ],
  missing: [],
};

const plan = (sections: Extract<DraftOperation, { type: "set_interview_plan" }>["sections"]) =>
  ({ type: "set_interview_plan", sections }) as const;

describe("the Interview plan in the draft", () => {
  it("deletes and reorders Sections and changes criteria, keeping the ids of the remaining ones", () => {
    const state = stateAfter(target, [
      plan([
        {
          name: "Go",
          kind: "topics",
          gradingCriteria: "Практика",
          enabled: true,
          topics: ["Каналы"],
        },
        { name: "Опыт", kind: "conversation", gradingCriteria: "", enabled: false, topics: [] },
      ]),
    ]);

    expect(state.sections).toStrictEqual([
      {
        id: "section-2",
        name: "Go",
        kind: "topics",
        gradingCriteria: "Практика",
        enabled: true,
        topics: ["Каналы"],
      },
      {
        id: "section-1",
        name: "Опыт",
        kind: "conversation",
        gradingCriteria: "",
        enabled: false,
        topics: [],
      },
    ]);
    expect(state.topics).toContain("Горутины");
  });

  it("keeps the switch, criteria and Topics that a plan entry leaves out; a new Section is on", () => {
    const switchedOff: SetupState = {
      ...target,
      sections: [
        {
          id: "section-2",
          name: "Go",
          kind: "topics",
          gradingCriteria: "Модель памяти",
          enabled: false,
          topics: ["Горутины", "Каналы"],
        },
      ],
    };

    const state = stateAfter(switchedOff, [
      plan([
        { name: "Go", kind: "topics" },
        { name: "Алгоритмы", kind: "topics" },
      ]),
    ]);

    expect(state.sections).toStrictEqual([
      {
        id: "section-2",
        name: "Go",
        kind: "topics",
        gradingCriteria: "Модель памяти",
        enabled: false,
        topics: ["Горутины", "Каналы"],
      },
      {
        id: null,
        name: "Алгоритмы",
        kind: "topics",
        gradingCriteria: "",
        enabled: true,
        topics: [],
      },
    ]);
  });

  it("renames a Topic in the plan and in its Questions", () => {
    const state = stateAfter(target, [
      {
        ...plan([
          { name: "Go", kind: "topics", gradingCriteria: "", enabled: true, topics: ["Горутины"] },
        ]),
        renameTopics: [{ from: "горутины", to: "Горутины и планировщик" }],
      },
    ]);

    expect(state.sections[0]?.topics).toStrictEqual(["Горутины и планировщик"]);
    expect(state.questions[0]?.topic).toBe("Горутины и планировщик");
    expect(state.topicRenames).toStrictEqual([{ from: "горутины", to: "Горутины и планировщик" }]);
    expect(draftProblems(state)).toStrictEqual([]);
  });

  it("merges a Topic into another: its Questions move there", () => {
    const state = stateAfter(target, [
      {
        ...plan([
          {
            name: "Go",
            kind: "topics",
            gradingCriteria: "",
            enabled: true,
            topics: ["Горутины", "Каналы"],
          },
        ]),
        renameTopics: [{ from: "Мьютексы", to: "Каналы" }],
      },
    ]);

    expect(state.questions.map((question) => question.topic)).toStrictEqual(["Горутины", "Каналы"]);
    expect(state.topics).not.toContain("Мьютексы");
  });

  it("refuses to rename a Topic the Target does not have", () => {
    const state = stateAfter(target, [
      {
        ...plan(target.sections.map(({ id: _id, ...section }) => section)),
        renameTopics: [{ from: "Rust", to: "Go" }],
      },
    ]);

    expect(draftProblems(state)).toStrictEqual(["Темы «Rust» нет в цели."]);
  });
});

describe("the Preferences in the draft", () => {
  it("adds, changes and turns off Preferences", () => {
    const state = stateAfter(target, [
      { type: "save_preference", id: "rule-2", text: "Больше практики" },
      { type: "save_preference", id: "rule-1", text: "Без определений" },
      { type: "save_preference", id: "rule-2", active: false },
    ]);

    expect(state.preferences).toStrictEqual([
      { id: "rule-1", text: "Без определений", rejectedQuestionIds: [], active: true },
      { id: "rule-2", text: "Больше практики", rejectedQuestionIds: [], active: false },
    ]);
  });

  it("refuses to change a Preference the Target does not have", () => {
    const state = stateAfter(target, [{ type: "save_preference", id: "rule-9", active: false }]);

    expect(draftProblems(state)).toStrictEqual(["Preference rule-9 нет в цели."]);
  });
});

describe("the Questions in the draft", () => {
  it("adds Questions and rephrases, moves, hides and rates them", () => {
    const added = { ...newGoroutine, id: "question-3", text: "Что такое select?", level: null };
    const state = stateAfter(target, [
      { type: "add_questions", questions: [added] },
      {
        type: "edit_questions",
        edits: [
          { id: "question-1", text: "Чем горутина отличается от потока?", rating: "useful" },
          { id: "question-2", topic: "Каналы", hidden: true },
          { id: "question-3", topic: "Каналы" },
        ],
      },
    ]);

    expect(state.questions).toStrictEqual([
      { ...goroutine, text: "Чем горутина отличается от потока?", rating: "useful" },
      { ...goroutine, id: "question-2", topic: "Каналы", text: "Что такое мьютекс?", hidden: true },
      { ...added, topic: "Каналы", hidden: false, rating: null, referenceAnswer: null },
    ]);
    expect(draftProblems(state)).toStrictEqual([]);
  });

  it("corrects the reference answer of a Question", () => {
    const answer = {
      points: ["Лёгкий поток", "Планировщик Go", "Стек растёт"],
      sample: "Горутина…",
    };
    const state = stateAfter(target, [
      { type: "edit_questions", edits: [{ id: "question-1", referenceAnswer: answer }] },
    ]);

    expect(state.questions[0]).toStrictEqual({ ...goroutine, referenceAnswer: answer });
    expect(draftProblems(state)).toStrictEqual([]);
  });

  it("refuses to edit a Question the Target does not have", () => {
    const state = stateAfter(target, [
      { type: "edit_questions", edits: [{ id: "question-9", hidden: true }] },
    ]);

    expect(draftProblems(state)).toStrictEqual(["Вопроса question-9 нет в цели."]);
  });

  it("refuses a quiz without a correct answer and a Question without a level", () => {
    const quiz = {
      ...newGoroutine,
      id: "question-3",
      text: "Сколько стоит горутина?",
      format: "quiz",
      options: [
        { id: "a", text: "2 КБ" },
        { id: "b", text: "1 МБ" },
      ],
      correctOptionIds: [],
    } as const;
    const state = stateAfter({ ...target, level: null }, [
      {
        type: "add_questions",
        questions: [
          quiz,
          { ...newGoroutine, id: "question-4", text: "Что такое GMP?", level: null },
        ],
      },
    ]);

    expect(draftProblems(state)).toStrictEqual([
      "У квиза «Сколько стоит горутина?» нет верного ответа.",
      "У вопроса «Что такое GMP?» нет уровня: укажите уровень цели или вопроса.",
    ]);
  });
});
