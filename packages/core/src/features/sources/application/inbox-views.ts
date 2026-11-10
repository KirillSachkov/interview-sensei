// What the Candidate sees of Inbox processing: the proposal card in the setup chat, the state for
// the card «Материалы», and the Inbox report.
import type { InboxProposal, InboxReport } from "../domain/inbox.ts";
import type { InboxBankQuestion, InboxTarget } from "../domain/ports.ts";
import { reportQuestions } from "../domain/report-questions.ts";
import type { Source } from "../domain/source.ts";
import { textFormat } from "../domain/source-text.ts";
import type { InboxContext } from "./inbox-context.ts";

/**
 * One material of the proposal card: its type and volume from the server, whether it is a video or
 * audio, and the agent's assessment.
 */
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
      // A recording needs speech recognition: the card offers its components.
      const video = textFormat(source) === "video";
      return [{ sourceId, type, title, url, size, video, assessment }];
    }),
  );
  return items.flat();
}

/**
 * The Target's Inbox processing as the card «Материалы» and the setup chat show it: the open
 * proposal with the materials still in the Inbox, the open proposal of a recheck, the running
 * processing, the latest report and how many materials wait. Null for an unknown Target.
 */
export async function inboxState(context: InboxContext, targetId: string) {
  const { targets, repository, inbox } = context.dependencies;
  if ((await targets.get(targetId)) === undefined) {
    return null;
  }
  const [sources, proposal, recheck, run, report] = await Promise.all([
    repository.list(targetId),
    inbox.openProposal(targetId, "processing"),
    inbox.openProposal(targetId, "recheck"),
    inbox.runningRun(targetId),
    inbox.latestReport(targetId),
  ]);
  const items = proposal === undefined ? [] : await proposalItems(context, proposal);
  return {
    proposal:
      proposal === undefined || items.length === 0
        ? null
        : { id: proposal.id, createdAt: proposal.createdAt, items },
    recheckProposal:
      recheck === undefined
        ? null
        : { id: recheck.id, createdAt: recheck.createdAt, reason: recheck.reason ?? "" },
    run:
      run === undefined
        ? null
        : {
            id: run.id,
            mode: run.mode,
            status: run.status,
            sourceIds: run.sourceIds,
            startedAt: run.startedAt,
          },
    latestReport:
      report === undefined
        ? null
        : {
            id: report.id,
            mode: report.mode,
            createdAt: report.createdAt,
            partial: report.partial,
          },
    unprocessed: sources.filter((source) => source.status === "inbox").length,
  };
}

/** The material of the Question with its title and part; null without one or once it is deleted. */
function questionSource(question: InboxBankQuestion, sources: readonly Source[]) {
  const [sourceId] = question.sourceIds;
  const source = sources.find((candidate) => candidate.id === sourceId);
  return source === undefined
    ? null
    : { id: source.id, title: source.title, part: question.sourcePart };
}

/**
 * A Question of the report under its Topic, with the marks the Candidate reviews it by, its
 * material with the part, and its reference answer.
 */
function reportQuestion(question: InboxBankQuestion, sources: readonly Source[]) {
  const { id, text, level, sectionKind, hidden, unconfirmed, unseen, rating, ratingComment } =
    question;
  const answer = question.referenceAnswer;
  return {
    id,
    text,
    level,
    sectionKind,
    hidden,
    unconfirmed,
    unseen,
    rating,
    ratingComment,
    source: questionSource(question, sources),
    referenceAnswer:
      answer === null
        ? null
        : {
            points: answer.points,
            sample: answer.sample,
            origin: answer.origin,
            part: answer.part,
          },
  };
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
    sources,
  }: {
    target: InboxTarget;
    topics: readonly { readonly id: string; readonly name: string }[];
    sources: readonly Source[];
  },
): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const question of questions) {
    const group = sectionGroup(groups, target, question.topicId);
    topicGroup(group, topics, question.topicId).questions.push(reportQuestion(question, sources));
  }
  return groups;
}

function reportSource({ id, type, title, url, status, failure }: Source) {
  return { id, type, title, url, status, failure };
}

/** The list «скрыть?» with each Question's text, Topic and visibility; deleted ones left out. */
function hideList(
  hide: InboxReport["proposals"]["hide"],
  {
    bank,
    topics,
  }: {
    bank: readonly InboxBankQuestion[];
    topics: readonly { readonly id: string; readonly name: string }[];
  },
) {
  return hide.flatMap(({ questionId, reason }) => {
    const question = bank.find((candidate) => candidate.id === questionId);
    if (question === undefined) {
      return [];
    }
    const topic = topics.find((candidate) => candidate.id === question.topicId)?.name ?? "";
    return [{ questionId, text: question.text, topic, reason, hidden: question.hidden }];
  });
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
  const { id, mode, partial, createdAt, summary, duplicates, doubtful, proposals } = report;
  const added = reportQuestions(report.questionIds, bank, { onlyNew: false });
  const shown = onlyNew ? reportQuestions(report.questionIds, bank, { onlyNew }) : added;
  return {
    id,
    mode,
    partial,
    createdAt,
    summary,
    duplicates,
    doubtful,
    proposals: { sections: proposals.sections, preferences: proposals.preferences },
    toHide: hideList(proposals.hide, { bank, topics }),
    added: added.length,
    newQuestions: added.filter((question) => question.unseen).length,
    sources: sources
      .filter((source) => report.sourceIds.includes(source.id))
      .map((source) => reportSource(source)),
    sections: bySection(shown, { target, topics, sources }),
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

/** The history of the Target's Inbox reports, the newest first; null for an unknown Target. */
export async function reportList({ dependencies }: InboxContext, targetId: string) {
  if ((await dependencies.targets.get(targetId)) === undefined) {
    return null;
  }
  const reports = await dependencies.inbox.reports(targetId);
  return reports.map(({ id, mode, partial, createdAt, questionIds, proposals }) => ({
    id,
    mode,
    partial,
    createdAt,
    added: questionIds.length,
    toHide: proposals.hide.length,
  }));
}
