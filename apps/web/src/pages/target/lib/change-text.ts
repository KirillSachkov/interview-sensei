import type { DraftOperation } from "@/shared/api";

const levelNames = { junior: "Junior", middle: "Middle", senior: "Senior" } as const;
const toneNames = { friendly: "дружелюбный", neutral: "нейтральный", strict: "строгий" } as const;

/** «1 секция», «2 секции», «5 секций». */
function sectionCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) {
    return `${count} секция`;
  }
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return `${count} секции`;
  }
  return `${count} секций`;
}

/** One change of the draft as the Candidate reads it in the list above the message form. */
export function changeText(operation: DraftOperation): string {
  switch (operation.type) {
    case "update_target": {
      const parts = [
        operation.name === undefined ? null : `название «${operation.name}»`,
        operation.level === undefined ? null : `уровень ${levelNames[operation.level]}`,
        operation.tone === undefined ? null : `тон ${toneNames[operation.tone]}`,
        operation.language === undefined ? null : `язык ${operation.language}`,
      ];
      return `Цель: ${parts.filter((part) => part !== null).join(", ")}`;
    }
    case "set_interview_plan": {
      const names = operation.sections.map((section) => `«${section.name}»`).join(", ");
      return `План: ${sectionCount(operation.sections.length)} — ${names}`;
    }
    default: {
      return operation satisfies never;
    }
  }
}
