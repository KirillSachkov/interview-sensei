import type { TargetView } from "@/shared/api";

import { toggledChatSize } from "../model/setup-chat-state";
import type { ChatSize, SetupChatState } from "../model/setup-chat-state";
import { AnswersCard } from "./answers-card";
import { Readiness } from "./readiness/readiness";
import { ReferenceChecks } from "./reference-checks";
import { SetupChat, SetupInvite } from "./setup-chat";
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

/**
 * The «Цель» zone as three columns of widgets. Left: the Target's name and level, «Начать
 * мок-собеседование» and «Готовность». Middle: the setup chat, open unless the Candidate hid it.
 * Right: the Interview plan, the list «Проверить опорный ответ», the materials and the reference
 * answers.
 */
export function GoalZone({
  zone: { target, chat, onChat, onQuestions, onReport, onAnswerReport },
}: {
  zone: GoalZoneProps;
}) {
  const openChat = () => {
    onChat({ ...chat, shown: true });
  };
  const resize = (size: ChatSize) => {
    onChat({ ...chat, size });
  };
  return (
    <div className="goal-grid" style={{ gridTemplateColumns: `400px ${chat.size.width}px 440px` }}>
      <div className="goal-column">
        <div className="goal-tile-group">
          <TargetCard target={target} />
          <button type="button" onClick={openChat}>
            Настроить цель
          </button>
        </div>
        <StartTile target={target} />
        <Readiness targetId={target.id} />
      </div>
      <div className="goal-column">
        {chat.shown ? (
          <SetupChat
            targetId={target.id}
            draft={target.status === "draft"}
            size={chat.size}
            onResize={resize}
            onToggleSize={() => {
              resize(toggledChatSize(chat.size));
            }}
            onClose={() => {
              onChat({ ...chat, shown: false });
            }}
          />
        ) : (
          <SetupInvite onOpen={openChat} />
        )}
      </div>
      <div className="goal-column">
        <TargetPlan target={target} actions={{ onSetup: openChat, onQuestions }} />
        <ReferenceChecks targetId={target.id} onFix={openChat} />
        <SourcesCard targetId={target.id} onReport={onReport} />
        <AnswersCard targetId={target.id} onReport={onAnswerReport} />
      </div>
    </div>
  );
}
