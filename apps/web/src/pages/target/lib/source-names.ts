import type { SourceType, SourceView } from "@/shared/api";

/** What the material is, in the words of the screen. */
export const sourceTypeNames: Record<SourceType, string> = {
  vacancy: "вакансия",
  resume: "резюме",
  link: "ссылка",
  file: "файл",
  note: "заметка",
  transcript: "транскрипт",
};

/** Where the material is in its Inbox processing, in the words of the screen. */
export function sourceStatusText({
  status,
  failure,
  progress,
}: Pick<SourceView, "status" | "failure"> & { readonly progress?: number | null }) {
  switch (status) {
    case "inbox": {
      return "в Inbox";
    }
    case "processing": {
      return "разбирается";
    }
    case "transcribing": {
      return progress === null || progress === undefined
        ? "транскрибируется"
        : `транскрибируется ${progress} %`;
    }
    case "ready": {
      return "готов";
    }
    case "failed": {
      return failure === null ? "ошибка" : `ошибка: ${failure}`;
    }
    default: {
      return status satisfies never;
    }
  }
}
