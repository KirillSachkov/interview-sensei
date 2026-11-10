import { useMutation, useQueryClient } from "@tanstack/react-query";

import { setSectionEnabled } from "@/shared/api";
import type {
  PlanSection,
  QuestionScope,
  TargetView,
  TopicImportance,
  TopicStatus,
} from "@/shared/api";

import { questionCount } from "../lib/question-count";
import { refreshPlanViews } from "../model/plan-views";
import { useProgress } from "../model/progress";
import { TopicDot, TopicStatusText } from "./topic-status";

const kindNames: Record<PlanSection["kind"], string> = {
  conversation: "разговор",
  topics: "вопросы по темам",
  design: "проектирование",
};

/** Which Questions the side panel shows, and its title. */
export interface QuestionsView {
  readonly scope: QuestionScope;
  readonly title: string;
}

export interface PlanActions {
  /** ✎: opens the setup chat. */
  readonly onSetup: (sectionId: string) => void;
  readonly onQuestions: (view: QuestionsView) => void;
}

/** The importance on a Topic chip; «обычная» shows nothing. */
const importanceMarks: Readonly<Record<TopicImportance, { mark: string; name: string } | null>> = {
  high: { mark: "↑", name: "высокая важность" },
  normal: null,
  low: { mark: "↓", name: "низкая важность" },
};

function ImportanceMark({ importance }: { importance: TopicImportance }) {
  const shown = importanceMarks[importance];
  return shown === null ? null : (
    <span className={`topic-importance ${importance}`} title={shown.name}>
      <span aria-hidden="true">{shown.mark}</span>
      <span className="visually-hidden">, {shown.name}</span>
    </span>
  );
}

/** The Topic status of each Topic of the plan by its id; empty until the progress loads. */
type TopicStatuses = ReadonlyMap<string, TopicStatus>;

/** The Section's switch: it writes at once, without the draft of changes. */
function SectionToggle({ targetId, section }: { targetId: string; section: PlanSection }) {
  const queryClient = useQueryClient();
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => setSectionEnabled(targetId, section.id, enabled),
    onSuccess: async (target) => {
      queryClient.setQueryData(["targets", targetId], target);
      await refreshPlanViews(queryClient, targetId);
    },
  });
  return (
    <>
      <input
        type="checkbox"
        role="switch"
        aria-checked={section.enabled}
        className="switch"
        aria-label={`Секция «${section.name}» включена`}
        checked={section.enabled}
        disabled={toggle.isPending}
        onChange={(event) => {
          toggle.mutate(event.target.checked);
        }}
      />
      {toggle.isError ? <p role="alert">Секция не переключилась: {toggle.error.message}</p> : null}
    </>
  );
}

function SectionTopics({
  section,
  statuses,
  actions,
}: {
  section: PlanSection;
  statuses: TopicStatuses;
  actions: PlanActions;
}) {
  if (section.topics.length === 0) {
    return null;
  }
  return (
    <ul className="plan-topics" aria-label="Темы">
      {section.topics.map((topic) => {
        const status = statuses.get(topic.id);
        return (
          <li key={topic.id}>
            <button
              type="button"
              className="tag topic-chip"
              title={questionCount(topic.questionCount)}
              onClick={() => {
                actions.onQuestions({ scope: { topicId: topic.id }, title: topic.name });
              }}
            >
              {status === undefined ? null : <TopicDot status={status} />}
              <span>
                {topic.name}
                {status === undefined ? null : <TopicStatusText status={status} />}
              </span>
              <ImportanceMark importance={topic.importance} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The Section's number, name and kind, with its switch and ✎. */
function SectionHead({
  targetId,
  section,
  number,
  onSetup,
}: {
  targetId: string;
  section: PlanSection;
  number: number;
  onSetup: () => void;
}) {
  return (
    <div className="plan-head">
      <span className="plan-number">{number}</span>
      <span className="plan-name">{section.name}</span>
      <span className="plan-kinds">
        <span className="tag">{kindNames[section.kind]}</span>
        {section.enabled ? null : <span className="tag">выключена</span>}
      </span>
      <span className="plan-tools">
        <SectionToggle targetId={targetId} section={section} />
        <button
          type="button"
          className="ghost"
          aria-label={`Настроить секцию «${section.name}»`}
          onClick={onSetup}
        >
          ✎
        </button>
      </span>
    </div>
  );
}

function SectionBlock({
  targetId,
  section,
  number,
  statuses,
  actions,
}: {
  targetId: string;
  section: PlanSection;
  number: number;
  statuses: TopicStatuses;
  actions: PlanActions;
}) {
  const count = section.topics.reduce((sum, topic) => sum + topic.questionCount, 0);
  return (
    <li
      className={`plan-section plan-kind-${section.kind}${section.enabled ? "" : " plan-off"}`}
      aria-label={section.name}
    >
      <SectionHead
        targetId={targetId}
        section={section}
        number={number}
        onSetup={() => {
          actions.onSetup(section.id);
        }}
      />
      <SectionTopics section={section} statuses={statuses} actions={actions} />
      {section.topics.length === 0 ? null : (
        <button
          type="button"
          className="ghost plan-count"
          onClick={() => {
            actions.onQuestions({ scope: { sectionId: section.id }, title: section.name });
          }}
        >
          {questionCount(count)}
        </button>
      )}
    </li>
  );
}

/**
 * The Target's Interview plan in the «Цель» zone: numbered Sections with a colour bar by Section
 * kind, Topic chips with their Topic status dots and ↑ or ↓ for a high or low importance, the
 * number of Questions, the switch and ✎. A chip or the number opens the Questions in the side panel.
 */
export function TargetPlan({ target, actions }: { target: TargetView; actions: PlanActions }) {
  const progress = useProgress(target.id);
  const statuses: TopicStatuses = new Map(
    progress.data?.topics.map((topic) => [topic.id, topic.status]),
  );
  if (target.sections.length === 0) {
    return <p className="muted">Плана пока нет: его соберёт агент в чате настройки.</p>;
  }
  return (
    <ol className="plan" aria-label="План собеседования">
      {target.sections.map((section, index) => (
        <SectionBlock
          key={section.id}
          targetId={target.id}
          section={section}
          number={index + 1}
          statuses={statuses}
          actions={actions}
        />
      ))}
    </ol>
  );
}
