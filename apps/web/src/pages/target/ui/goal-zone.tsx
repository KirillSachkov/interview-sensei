import type { TargetView } from "@/shared/api";

import { Readiness } from "./readiness/readiness";
import { SetupChat } from "./setup-chat";
import { SourcesCard } from "./sources-card";
import { TargetCard } from "./target-card";
import { TargetPlan } from "./target-plan";
import type { QuestionsView } from "./target-plan";

export type { QuestionsView } from "./target-plan";

/** Where the setup chat is open: beside the Target card, beside a Section, or nowhere. */
export type SetupAnchor = "target" | { readonly sectionId: string } | null;

export interface GoalZoneProps {
  readonly target: TargetView;
  readonly setupAnchor: SetupAnchor;
  readonly onSetup: (anchor: Exclude<SetupAnchor, null>) => void;
  readonly onCloseSetup: () => void;
  readonly onQuestions: (view: QuestionsView) => void;
  /** Opens the side panel of an Inbox report. */
  readonly onReport: (reportId: string) => void;
}

/**
 * The «Цель» zone: the Target's name and level, «Настроить цель», «Готовность», the Interview plan
 * and the materials. The setup chat opens beside the card or the Section where the Candidate opened it.
 */
export function GoalZone({
  zone: { target, setupAnchor, onSetup, onCloseSetup, onQuestions, onReport },
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
      <SourcesCard targetId={target.id} onReport={onReport} />
    </>
  );
}
