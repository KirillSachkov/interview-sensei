import type { DraftOperation } from "@/shared/api";

const levelNames = { junior: "Junior", middle: "Middle", senior: "Senior" } as const;
const toneNames = { friendly: "дружелюбный", neutral: "нейтральный", strict: "строгий" } as const;

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
    operation.language === undefined ? null : `язык ${operation.language}`,
  ];
  return `Цель: ${parts.filter((part) => part !== null).join(", ")}`;
}

function planText(operation: Operation<"set_interview_plan">): string {
  const sections = counted(operation.sections.length, ["секция", "секции", "секций"]);
  const names = quoted(operation.sections.map((section) => section.name));
  const renames = (operation.renameTopics ?? []).map(
    ({ from, to }) => `; тема «${from}» станет «${to}»`,
  );
  return `План: ${sections} — ${names}${renames.join("")}`;
}

function preferenceText(operation: Operation<"save_preference">): string {
  const parts = [
    operation.text === undefined ? null : `«${operation.text}»`,
    operation.active === false ? "выключить" : null,
    operation.active === true ? "включить" : null,
  ];
  return `Preference: ${parts.filter((part) => part !== null).join(", ")}`;
}

/** What the edits do to the Questions, each kind once. */
function editsText(operation: Operation<"edit_questions">): string {
  const kinds = operation.edits.flatMap((edit) => [
    edit.text === undefined ? [] : ["переформулировать"],
    edit.topic === undefined ? [] : [`перенести в тему «${edit.topic}»`],
    edit.hidden === true ? ["скрыть"] : [],
    edit.hidden === false ? ["вернуть"] : [],
    edit.rating === undefined ? [] : ["оценить"],
  ]);
  const questions = counted(operation.edits.length, ["вопрос", "вопроса", "вопросов"]);
  return `Вопросы: изменить ${questions} — ${[...new Set(kinds.flat())].join(", ")}`;
}

/** One change of the draft as the Candidate reads it in the list above the message form. */
export function changeText(operation: DraftOperation): string {
  switch (operation.type) {
    case "update_target": {
      return targetText(operation);
    }
    case "set_interview_plan": {
      return planText(operation);
    }
    case "save_preference": {
      return preferenceText(operation);
    }
    case "add_questions": {
      const questions = counted(operation.questions.length, ["вопрос", "вопроса", "вопросов"]);
      return `Вопросы: добавить ${questions} — ${quoted(operation.questions.map((question) => question.text))}`;
    }
    case "edit_questions": {
      return editsText(operation);
    }
    default: {
      return operation satisfies never;
    }
  }
}
