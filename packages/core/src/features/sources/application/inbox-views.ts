// What the Candidate sees of Inbox processing: the proposal card in the setup chat, the state for
// the card «Материалы», and the Inbox report.
import type { InboxProposal } from "../domain/inbox.ts";
import type { InboxBankQuestion, InboxTarget } from "../domain/ports.ts";
import { reportQuestions } from "../domain/report-questions.ts";
import type { Source } from "../domain/source.ts";
import type { InboxContext } from "./inbox-context.ts";

/** One material of the proposal card: its type and volume from the server, the agent's assessment. */
async function proposalItems({ dependencies }: InboxContext, proposal: InboxProposal) {
  const sources = await dependencies.repository.list(proposal.targetId);
  const items = await Promise.all(
    proposal.items.map(async ({ sourceId, assessment }) => {
      const source = sources.find((candidate) => candidate.id === sourceId);
      if (source?.status !== "inbox") {
        return [];
      }
      const size = source.file === null ? null : await dependencies.files.size(source.file);
      const { type, title, url } = source;
      return [{ sourceId, type, title, url, size, assessment }];
    }),
  );
  return items.flat();
}

/**
 * The Target's Inbox processing as the card «Материалы» and the setup chat show it: the open
 * proposal with the materials still in the Inbox, the running processing, the latest report and
 * how many materials wait. Null for an unknown Target.
 */
export async function inboxState(context: InboxContext, targetId: string) {
  const { targets, repository, inbox } = context.dependencies;
  if ((await targets.get(targetId)) === undefined) {
    return null;
  }
  const [sources, proposal, run, report] = await Promise.all([
    repository.list(targetId),
    inbox.openProposal(targetId),
    inbox.runningRun(targetId),
    inbox.latestReport(targetId),
  ]);
  const items = proposal === undefined ? [] : await proposalItems(context, proposal);
  return {
    proposal:
      proposal === undefined || items.length === 0
        ? null
        : { id: proposal.id, createdAt: proposal.createdAt, items },
    run:
      run === undefined
        ? null
        : { id: run.id, status: run.status, sourceIds: run.sourceIds, startedAt: run.startedAt },
    latestReport:
      report === undefined
        ? null
        : { id: report.id, createdAt: report.createdAt, partial: report.partial },
    unprocessed: sources.filter((source) => source.status === "inbox").length,
  };
}

/** A Question of the report under its Topic, with the marks the Candidate reviews it by. */
function reportQuestion(question: InboxBankQuestion) {
  const { id, text, level, sectionKind, hidden, unconfirmed, unseen, rating, ratingComment } =
    question;
  return { id, text, level, sectionKind, hidden, unconfirmed, unseen, rating, ratingComment };
}

interface TopicGroup {
  readonly id: string;
  readonly name: string;
  readonly questions: ReturnType<typeof reportQuestion>[];
}

interface SectionGroup {
  readonly id: string | null;
  readonly name: string;
  readonly topics: TopicGroup[];
}

/** The group of the Section that has the Topic first in the plan, or «Без секции»; added when new. */
function sectionGroup(groups: SectionGroup[], target: InboxTarget, topicId: string): SectionGroup {
  const section = target.sections.find((candidate) => candidate.topicIds.includes(topicId));
  const id = section?.id ?? null;
  const found = groups.find((candidate) => candidate.id === id);
  if (found !== undefined) {
    return found;
  }
  const group: SectionGroup = { id, name: section?.name ?? "Без секции", topics: [] };
  groups.push(group);
  return group;
}

/** The group of the Topic in the Section's group; added when new. */
function topicGroup(
  group: SectionGroup,
  topics: readonly { readonly id: string; readonly name: string }[],
  topicId: string,
): TopicGroup {
  const found = group.topics.find((candidate) => candidate.id === topicId);
  if (found !== undefined) {
    return found;
  }
  const name = topics.find((candidate) => candidate.id === topicId)?.name ?? "";
  const topic: TopicGroup = { id: topicId, name, questions: [] };
  group.topics.push(topic);
  return topic;
}

/**
 * The Questions by Section and Topic in their order. A Topic belongs to the first Section of the
 * plan that has it; a Topic outside the plan goes to «Без секции».
 */
function bySection(
  questions: readonly InboxBankQuestion[],
  {
    target,
    topics,
  }: {
    target: InboxTarget;
    topics: readonly { readonly id: string; readonly name: string }[];
  },
): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const question of questions) {
    const group = sectionGroup(groups, target, question.topicId);
    topicGroup(group, topics, question.topicId).questions.push(reportQuestion(question));
  }
  return groups;
}

function reportSource({ id, type, title, url, status, failure }: Source) {
  return { id, type, title, url, status, failure };
}

/**
 * The Target's Inbox report for the panel; null for another Target's report and unknown ones.
 * `onlyNew` is the filter «новые с последнего просмотра» of the added Questions.
 */
export async function reportView(
  context: InboxContext,
  { targetId, reportId, onlyNew }: { targetId: string; reportId: string; onlyNew: boolean },
) {
  const { inbox, targets, questions, repository } = context.dependencies;
  const report = await inbox.report(targetId, reportId);
  const target = await targets.get(targetId);
  if (report === undefined || target === undefined) {
    return null;
  }
  const [bank, topics, sources] = await Promise.all([
    questions.questions(targetId),
    questions.topics(targetId),
    repository.list(targetId),
  ]);
  const added = reportQuestions(report.questionIds, bank, { onlyNew: false });
  const shown = onlyNew ? reportQuestions(report.questionIds, bank, { onlyNew }) : added;
  const { id, mode, partial, createdAt, summary, duplicates, doubtful, proposals } = report;
  return {
    id,
    mode,
    partial,
    createdAt,
    summary,
    duplicates,
    doubtful,
    proposals,
    added: added.length,
    newQuestions: added.filter((question) => question.unseen).length,
    sources: sources
      .filter((source) => report.sourceIds.includes(source.id))
      .map((source) => reportSource(source)),
    sections: bySection(shown, { target, topics }),
  };
}

/** «просмотрено»: the Candidate has seen the report's Questions; false for an unknown report. */
export async function markReportSeen(
  { dependencies }: InboxContext,
  { targetId, reportId }: { targetId: string; reportId: string },
): Promise<boolean> {
  const report = await dependencies.inbox.report(targetId, reportId);
  if (report === undefined) {
    return false;
  }
  await dependencies.questions.markSeen(targetId, report.questionIds);
  return true;
}
