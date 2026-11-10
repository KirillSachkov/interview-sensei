import type { TargetView } from "@/shared/api";

import { toggledChatSize } from "../model/setup-chat-state";
import type { ChatSize, SetupChatState } from "../model/setup-chat-state";
import { AnswersCard } from "./answers-card";
import { Readiness } from "./readiness/readiness";
import { ReferenceChecks } from "./reference-checks";
import { SetupChat } from "./setup-chat";
import { SourcesCard } from "./sources-card";
import { StartTile } from "./start-tile";
import { TargetCard } from "./target-card";
import { TargetPlan } from "./target-plan";
import type { QuestionsView } from "./target-plan";

export interface GoalZoneProps {
  readonly target: TargetView;
  readonly chat: SetupChatState;
  readonly onChat: (state: SetupChatState) => void;
  readonly onQuestions: (view: QuestionsView) => void;
  /** Opens the side panel of an Inbox report. */
  readonly onReport: (reportId: string) => void;
  /** Opens the side panel of an answer report. */
  readonly onAnswerReport: (reportId: string) => void;
}

/** ✎ of a Section and «Исправить» put the cursor into the message box of the setup chat. */
function focusSetupChat() {
  document.querySelector<HTMLTextAreaElement>(".setup-chat textarea")?.focus();
}

/**
 * The «Цель» zone as three columns of widgets. Left: the Target's name and level, «Начать
 * мок-собеседование» and «Готовность». Middle: the setup chat, always open.
 * Right: the Interview plan, the list «Проверить опорный ответ», the materials and the reference
 * answers.
 */
export function GoalZone({
  zone: { target, chat, onChat, onQuestions, onReport, onAnswerReport },
}: {
  zone: GoalZoneProps;
}) {
  const resize = (size: ChatSize) => {
    onChat({ size });
  };
  return (
    <div className="goal-grid" style={{ gridTemplateColumns: `400px ${chat.size.width}px 440px` }}>
      <div className="goal-column">
        <TargetCard target={target} />
        <StartTile target={target} />
        <Readiness targetId={target.id} />
      </div>
      <div className="goal-column">
        <SetupChat
          targetId={target.id}
          draft={target.status === "draft"}
          size={chat.size}
          onResize={resize}
          onToggleSize={() => {
            resize(toggledChatSize(chat.size));
          }}
        />
      </div>
      <div className="goal-column">
        <TargetPlan target={target} actions={{ onSetup: focusSetupChat, onQuestions }} />
        <ReferenceChecks targetId={target.id} onFix={focusSetupChat} />
        <SourcesCard targetId={target.id} onReport={onReport} />
        <AnswersCard targetId={target.id} onReport={onAnswerReport} />
      </div>
    </div>
  );
}
