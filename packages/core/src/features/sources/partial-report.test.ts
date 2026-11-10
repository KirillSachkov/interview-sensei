import { describe, expect, it } from "vitest";

import { partialReport } from "./domain/inbox.ts";
import type { InboxRun } from "./domain/inbox.ts";

const run: InboxRun = {
  id: "run",
  targetId: "target",
  sessionId: "session",
  mode: "processing",
  status: "running",
  sourceIds: ["vacancy", "article", "video"],
  questionIds: ["q1", "q2"],
  duplicates: 1,
  readParts: { vacancy: [1, 2, 2], article: [1] },
  startedAt: "2026-11-09T10:00:00.000Z",
  finishedAt: null,
};

const ending = { id: "report", createdAt: "2026-11-09T10:05:00.000Z" };

describe(partialReport, () => {
  it("counts a material as processed only when the agent read each of its parts, and gives the rest back to the Inbox", () => {
    const sources = [
      { id: "vacancy", status: "processing", parts: 2 },
      { id: "article", status: "processing", parts: 3 },
      { id: "video", status: "failed", parts: null },
    ] as const;

    const { report, ready, back } = partialReport(run, sources, { ...ending, reason: "stopped" });

    expect({ ready, back }).toStrictEqual({ ready: ["vacancy"], back: ["article"] });
    expect(report).toStrictEqual({
      id: "report",
      targetId: "target",
      runId: "run",
      mode: "processing",
      sourceIds: ["vacancy", "article", "video"],
      questionIds: ["q1", "q2"],
      duplicates: 1,
      summary:
        "Разбор остановлен кандидатом. Разобрано полностью: 1 из 3. Вернулись в Inbox: 1. С ошибкой: 1.",
      doubtful: [],
      proposals: { sections: [], preferences: [], hide: [] },
      partial: true,
      createdAt: "2026-11-09T10:05:00.000Z",
    });
  });

  it("gives back a material whose text the server has not read yet", () => {
    const sources = [
      { id: "vacancy", status: "processing", parts: null },
      { id: "article", status: "processing", parts: null },
      { id: "video", status: "processing", parts: null },
    ] as const;
    const before = { ...run, sessionId: null, questionIds: [], duplicates: 0, readParts: {} };

    const { report, ready, back } = partialReport(before, sources, {
      ...ending,
      reason: "stopped",
    });

    expect({ ready, back }).toStrictEqual({ ready: [], back: ["vacancy", "article", "video"] });
    expect(report.summary).toBe(
      "Разбор остановлен кандидатом. Разобрано полностью: 0 из 3. Вернулись в Inbox: 3.",
    );
  });

  it("moves a bound transcript with its video: «готов» with a video read to the end, back to the Inbox otherwise", () => {
    const withTranscripts = {
      ...run,
      sourceIds: ["vacancy", "vacancy-text", "article", "article-text"],
    };
    const sources = [
      { id: "vacancy", status: "processing", parts: 2 },
      { id: "vacancy-text", status: "processing", parts: null },
      { id: "article", status: "processing", parts: 3 },
      { id: "article-text", status: "processing", parts: null },
    ] as const;
    const bound = new Map([
      ["vacancy-text", "vacancy"],
      ["article-text", "article"],
    ]);

    const { ready, back } = partialReport(withTranscripts, sources, {
      ...ending,
      reason: "stopped",
      bound,
    });

    expect({ ready, back }).toStrictEqual({
      ready: ["vacancy", "vacancy-text"],
      back: ["article", "article-text"],
    });
  });

  it("says why the processing ended", () => {
    const sources = [
      { id: "vacancy", status: "processing", parts: 2 },
      { id: "article", status: "ready", parts: 3 },
      { id: "video", status: "failed", parts: null },
    ] as const;
    const summaries = (
      ["agent_failed", "interrupted", "agent_not_started", "nothing_readable"] as const
    ).map((reason) => partialReport(run, sources, { ...ending, reason }).report.summary);

    expect(summaries).toStrictEqual([
      "Агент разбора упал. Разобрано полностью: 1 из 3. С ошибкой: 1.",
      "Разбор прерван: приложение перезапустилось. Разобрано полностью: 1 из 3. С ошибкой: 1.",
      "Агент разбора не запустился. Разобрано полностью: 1 из 3. С ошибкой: 1.",
      "Сервер не смог прочитать ни один материал: причина — у каждого материала. Разобрано полностью: 1 из 3. С ошибкой: 1.",
    ]);
  });

  it("a recheck that ended early says so without counting materials and proposes nothing to hide", () => {
    const recheck = {
      ...run,
      mode: "recheck" as const,
      sourceIds: [],
      questionIds: [],
      readParts: {},
    };

    const { report, ready, back } = partialReport(recheck, [], { ...ending, reason: "stopped" });

    expect({ ready, back }).toStrictEqual({ ready: [], back: [] });
    expect(report).toMatchObject({
      mode: "recheck",
      summary:
        "Перепроверка остановлена кандидатом. Список «скрыть?» не готов: запустите её снова.",
      proposals: { sections: [], preferences: [], hide: [] },
      partial: true,
    });
  });
});
