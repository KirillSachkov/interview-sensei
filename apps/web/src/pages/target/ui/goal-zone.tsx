import type { TargetView } from "@/shared/api";

import { AnswersCard } from "./answers-card";
import { Readiness } from "./readiness/readiness";
import { ReferenceChecks } from "./reference-checks";
import { SetupChat, SetupInvite } from "./setup-chat";
import { SourcesCard } from "./sources-card";
import { StartTile } from "./start-tile";
import { TargetCard } from "./target-card";
import { TargetPlan } from "./target-plan";
import type { QuestionsView } from "./target-plan";

/** The setup chat in the middle of the zone: closed, open, or open and enlarged. */
export type SetupChatState = "closed" | "open" | "large";

/** The zone's width in canvas pixels: the enlarged chat takes more room. */
export function goalZoneWidth(chat: SetupChatState): number {
  return chat === "large" ? 2120 : 1760;
}

export interface GoalZoneProps {
  readonly target: TargetView;
  readonly chat: SetupChatState;
  readonly onChat: (state: SetupChatState) => void;
  /** «Начать мок-собеседование»: shows the «Сессии» zone and opens its start dialog. */
  readonly onStartMock: () => void;
  readonly onQuestions: (view: QuestionsView) => void;
  /** Opens the side panel of an Inbox report. */
  readonly onReport: (reportId: string) => void;
  /** Opens the side panel of an answer report. */
  readonly onAnswerReport: (reportId: string) => void;
}

/**
 * The «Цель» zone as three columns of widgets. Left: the Target's name and level, «Начать
 * мок-собеседование» and «Готовность». Middle: the setup chat, or the invitation to open it.
 * Right: the Interview plan, the list «Проверить опорный ответ», the materials and the reference
 * answers.
 */
export function GoalZone({
  zone: { target, chat, onChat, onStartMock, onQuestions, onReport, onAnswerReport },
}: {
  zone: GoalZoneProps;
}) {
  const openChat = () => {
    if (chat === "closed") {
      onChat("open");
    }
  };
  return (
    <div className={`goal-grid${chat === "large" ? " goal-grid-large" : ""}`}>
      <div className="goal-column">
        <div className="goal-tile-group">
          <TargetCard target={target} />
          <button type="button" onClick={openChat}>
            Настроить цель
          </button>
        </div>
        <StartTile target={target} onStart={onStartMock} />
        <Readiness targetId={target.id} />
      </div>
      <div className="goal-column">
        {chat === "closed" ? (
          <SetupInvite onOpen={openChat} />
        ) : (
          <SetupChat
            targetId={target.id}
            large={chat === "large"}
            onResize={() => {
              onChat(chat === "large" ? "open" : "large");
            }}
            onClose={() => {
              onChat("closed");
            }}
          />
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
