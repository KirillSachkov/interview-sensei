import type { TargetView } from "@/shared/api";

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
}

/**
 * The «Цель» zone: the Target's name and level, «Настроить цель», the Interview plan and the
 * materials. The setup chat opens beside the card or the Section where the Candidate opened it.
 */
export function GoalZone({
  zone: { target, setupAnchor, onSetup, onCloseSetup, onQuestions },
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
      <SourcesCard targetId={target.id} />
    </>
  );
}
