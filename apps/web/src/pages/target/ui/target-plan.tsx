import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { setSectionEnabled } from "@/shared/api";
import type { PlanSection, QuestionScope, TargetView } from "@/shared/api";

import { questionCount } from "../lib/question-count";
import { refreshPlanViews } from "../model/plan-views";

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
  /** ✎: opens the setup chat beside the Section. */
  readonly onSetup: (sectionId: string) => void;
  readonly onQuestions: (view: QuestionsView) => void;
  /** The setup chat when it is open beside this Section. */
  readonly renderChat: (sectionId: string) => ReactNode;
}

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

function SectionTopics({ section, actions }: { section: PlanSection; actions: PlanActions }) {
  if (section.topics.length === 0) {
    return null;
  }
  return (
    <ul className="plan-topics" aria-label="Темы">
      {section.topics.map((topic) => (
        <li key={topic.id}>
          <button
            type="button"
            className="tag topic-chip"
            title={questionCount(topic.questionCount)}
            onClick={() => {
              actions.onQuestions({ scope: { topicId: topic.id }, title: topic.name });
            }}
          >
            {topic.name}
          </button>
        </li>
      ))}
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
  actions,
}: {
  targetId: string;
  section: PlanSection;
  number: number;
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
      <SectionTopics section={section} actions={actions} />
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
      {actions.renderChat(section.id)}
    </li>
  );
}

/**
 * The Target's Interview plan in the «Цель» zone: numbered Sections with a colour bar by Section
 * kind, Topic chips, the number of Questions, the switch and ✎. A chip or the number opens the
 * Questions in the side panel.
 */
export function TargetPlan({ target, actions }: { target: TargetView; actions: PlanActions }) {
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
          actions={actions}
        />
      ))}
    </ol>
  );
}
