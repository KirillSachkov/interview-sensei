import type { DraftChange, DraftOperation } from "@/shared/api";

const levelNames = { junior: "Junior", middle: "Middle", senior: "Senior" } as const;
const toneNames = { friendly: "дружелюбный", neutral: "нейтральный", strict: "строгий" } as const;
const languageNames: Readonly<Record<string, string>> = { ru: "русский", en: "английский" };

/** The Russian name of the Interviewer's language; an unknown code stays as it is. */
const languageName = (language: string) => languageNames[language] ?? language;

/** The count with the Russian word form for it: «1 секция», «2 секции», «5 секций». */
function counted(count: number, [one, few, many]: readonly [string, string, string]): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) {
    return `${count} ${one}`;
  }
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return `${count} ${few}`;
  }
  return `${count} ${many}`;
}

const quoted = (texts: readonly string[]) => texts.map((text) => `«${text}»`).join(", ");

type Operation<Type extends DraftOperation["type"]> = Extract<DraftOperation, { type: Type }>;

function targetText(operation: Operation<"update_target">): string {
  const parts = [
    operation.name === undefined ? null : `название «${operation.name}»`,
    operation.level === undefined ? null : `уровень ${levelNames[operation.level]}`,
    operation.tone === undefined ? null : `тон ${toneNames[operation.tone]}`,
    operation.language === undefined ? null : `язык ${languageName(operation.language)}`,
  ];
  return `Цель: ${parts.filter((part) => part !== null).join(", ")}`;
}

/** What the plan's Topic renames do: rename Topics, merge them into others, or both. */
function renamesText(renames: number, merges: number): string | null {
  if (renames === 0) {
    return null;
  }
  if (merges === 0) {
    return "переименование тем";
  }
  return merges === renames ? "объединение тем" : "переименование и объединение тем";
}

function planText(operation: Operation<"set_interview_plan">, merges: readonly string[]): string {
  const sections = counted(operation.sections.length, ["секция", "секции", "секций"]);
  const renames = renamesText(operation.renameTopics?.length ?? 0, merges.length);
  return renames === null ? `План: ${sections}` : `План: ${sections}, ${renames}`;
}

/** Each Section of the plan with its Topics, then the Section renames, the Topic renames and merges. */
function planDetails(
  operation: Operation<"set_interview_plan">,
  merges: readonly string[],
): string[] {
  const sections = operation.sections.map(({ name, topics }) =>
    topics === undefined || topics.length === 0 ? `«${name}»` : `«${name}»: ${quoted(topics)}`,
  );
  const sectionRenames = (operation.renameSections ?? []).map(
    ({ from, to }) => `Секция «${from}» станет «${to}»`,
  );
  const renames = (operation.renameTopics ?? []).map(({ from, to }) =>
    merges.includes(from)
      ? `Тема «${from}» объединится с «${to}»`
      : `Тема «${from}» станет «${to}»`,
  );
  return [...sections, ...sectionRenames, ...renames];
}

function preferenceText(operation: Operation<"save_preference">): string {
  const parts = [
    operation.text === undefined ? null : `«${operation.text}»`,
    operation.active === false ? "выключить" : null,
    operation.active === true ? "включить" : null,
  ];
  return `Пожелание: ${parts.filter((part) => part !== null).join(", ")}`;
}

/** What the edits do to the Questions, each kind once. */
function editsText(operation: Operation<"edit_questions">): string {
  const kinds = operation.edits.flatMap((edit) => [
    edit.text === undefined ? [] : ["переформулировать"],
    edit.topic === undefined ? [] : [`перенести в тему «${edit.topic}»`],
    edit.hidden === true ? ["скрыть"] : [],
    edit.hidden === false ? ["вернуть"] : [],
    edit.rating === undefined ? [] : ["оценить"],
    edit.referenceAnswer === undefined ? [] : ["исправить опорный ответ"],
  ]);
  const questions = counted(operation.edits.length, ["вопрос", "вопроса", "вопросов"]);
  return `Вопросы: изменить ${questions} — ${[...new Set(kinds.flat())].join(", ")}`;
}

const importanceNames = { high: "высокая", normal: "обычная", low: "низкая" } as const;

/** «Важность тем: «Kafka» — высокая, «SQL» — низкая». */
function importanceText(operation: Operation<"set_topic_importance">): string {
  const topics = operation.topics.map(
    ({ topic, importance }) => `«${topic}» — ${importanceNames[importance]}`,
  );
  return `Важность тем: ${topics.join(", ")}`;
}

/** A change's short line and the lines under it that the Candidate opens; no details for a short one. */
interface ChangeLines {
  readonly text: string;
  readonly details: readonly string[];
}

const short = (text: string): ChangeLines => ({ text, details: [] });

function changeLines({ operation, merges = [] }: DraftChange): ChangeLines {
  switch (operation.type) {
    case "update_target": {
      return short(targetText(operation));
    }
    case "set_interview_plan": {
      return { text: planText(operation, merges), details: planDetails(operation, merges) };
    }
    case "save_preference": {
      return short(preferenceText(operation));
    }
    case "set_topic_importance": {
      return short(importanceText(operation));
    }
    case "add_questions": {
      return {
        text: `Вопросы: добавить ${counted(operation.questions.length, ["вопрос", "вопроса", "вопросов"])}`,
        details: operation.questions.map((question) => `«${question.topic}»: ${question.text}`),
      };
    }
    case "edit_questions": {
      return short(editsText(operation));
    }
    default: {
      return operation satisfies never;
    }
  }
}

/** One change of the draft as the Candidate reads it in the list above the message form. */
export const changeText = (change: DraftChange): string => changeLines(change).text;

/** The lines under the change's short line that the Candidate opens: what a long change holds. */
export const changeDetails = (change: DraftChange): readonly string[] =>
  changeLines(change).details;
