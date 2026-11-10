import type { TargetView } from "@/shared/api";

import { AnswersCard } from "./answers-card";
import { Readiness } from "./readiness/readiness";
import { ReferenceChecks } from "./reference-checks";
import { SetupChat, setupChatOverhang } from "./setup-chat";
import { SourcesCard } from "./sources-card";
import { TargetCard } from "./target-card";
import { TargetPlan } from "./target-plan";
import type { QuestionsView } from "./target-plan";

/** Where the setup chat is open: beside the Target card, beside a Section, or nowhere. */
export type SetupAnchor = "target" | { readonly sectionId: string } | null;

/**
 * How far the zone's widgets reach beyond its width: the open setup chat stands to the right of
 * the zone, and the canvas moves «Сессии» aside for it (#71).
 */
export function goalZoneOverhang(anchor: SetupAnchor): number {
  return anchor === null ? 0 : setupChatOverhang;
}

export interface GoalZoneProps {
  readonly target: TargetView;
  readonly setupAnchor: SetupAnchor;
  readonly onSetup: (anchor: Exclude<SetupAnchor, null>) => void;
  readonly onCloseSetup: () => void;
  readonly onQuestions: (view: QuestionsView) => void;
  /** Opens the side panel of an Inbox report. */
  readonly onReport: (reportId: string) => void;
  /** Opens the side panel of an answer report. */
  readonly onAnswerReport: (reportId: string) => void;
}

/**
 * The «Цель» zone: the Target's name and level, «Настроить цель», «Готовность», the Interview plan,
 * the materials, the reference answers and the list «Проверить опорный ответ». The setup chat
 * opens beside the card or the Section where the Candidate opened it.
 */
export function GoalZone({
  zone: { target, setupAnchor, onSetup, onCloseSetup, onQuestions, onReport, onAnswerReport },
}: {
  zone: GoalZoneProps;
}) {
  const chat = <SetupChat targetId={target.id} onClose={onCloseSetup} />;
  return (
    <>
      <div className="setup-anchor">
        <TargetCard target={target} />
        <button
          type="button"
          onClick={() => {
            onSetup("target");
          }}
        >
          Настроить цель
        </button>
        {setupAnchor === "target" ? chat : null}
      </div>
      <Readiness targetId={target.id} />
      <TargetPlan
        target={target}
        actions={{
          onSetup: (sectionId) => {
            onSetup({ sectionId });
          },
          onQuestions,
          renderChat: (sectionId) =>
            typeof setupAnchor === "object" && setupAnchor?.sectionId === sectionId ? chat : null,
        }}
      />
      <ReferenceChecks
        targetId={target.id}
        onFix={() => {
          onSetup("target");
        }}
      />
      <SourcesCard targetId={target.id} onReport={onReport} />
      <AnswersCard targetId={target.id} onReport={onAnswerReport} />
    </>
  );
}
