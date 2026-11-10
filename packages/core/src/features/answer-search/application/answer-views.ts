// What the «Цель» zone shows of answer search: the start window's numbers, the status
// «ищет ответы: N из M», and the report with the token usage.
import { withoutAnswerCount } from "../domain/answer-search.ts";
import { queueOf } from "./answer-start.ts";
import type { AnswerContext } from "./answer-context.ts";

/**
 * The Target's answer search: `withoutAnswer` Questions without a reference answer, `queued` in the
 * queue, which also takes asked Questions with an answer «из знаний агента»; the run that waits or
 * runs with its progress; the latest report. Null for an unknown Target.
 */
export async function answerState({ dependencies }: AnswerContext, targetId: string) {
  const { targets, repository } = dependencies;
  if ((await targets.get(targetId)) === undefined) {
    return null;
  }
  const [{ queue, bank }, run, report] = await Promise.all([
    queueOf(dependencies, targetId),
    repository.activeRun(targetId),
    repository.latestReport(targetId),
  ]);
  return {
    withoutAnswer: withoutAnswerCount(bank),
    queued: queue.length,
    run:
      run === undefined
        ? null
        : {
            id: run.id,
            status: run.status,
            filled: run.saved.length,
            total: run.status === "waiting" ? run.requested : run.queueIds.length,
            startedAt: run.startedAt,
          },
    latestReport:
      report === undefined
        ? null
        : { id: report.id, partial: report.partial, createdAt: report.createdAt },
  };
}

/**
 * The report for its panel: the counts by origin, the filled and the failed Questions with their
 * text, and the token usage of the agent's latest ACP usage_update, read from the session's journal
 * now: an agent may report it after its last tool call. Null for an unknown report.
 */
export async function reportView(
  { dependencies }: AnswerContext,
  { targetId, reportId }: { targetId: string; reportId: string },
) {
  const { repository, questions, sessions } = dependencies;
  const report = await repository.report(targetId, reportId);
  if (report === undefined) {
    return null;
  }
  const [bank, usage] = await Promise.all([
    questions.questions(targetId),
    report.sessionId === null ? null : sessions.usage(report.sessionId),
  ]);
  const texts = new Map(bank.map((question) => [question.id, question.text]));
  const textOf = (questionId: string) => texts.get(questionId) ?? "Вопрос удалён";
  return {
    id: report.id,
    partial: report.partial,
    summary: report.summary,
    total: report.total,
    filled: report.filled.length,
    internet: report.filled.filter((answer) => answer.origin === "internet").length,
    agent: report.filled.filter((answer) => answer.origin === "agent").length,
    questions: report.filled.map(({ questionId, origin }) => ({
      questionId,
      text: textOf(questionId),
      origin,
    })),
    failed: report.failed.map(({ questionId, reason }) => ({
      questionId,
      text: textOf(questionId),
      reason,
    })),
    usage,
    createdAt: report.createdAt,
  };
}
