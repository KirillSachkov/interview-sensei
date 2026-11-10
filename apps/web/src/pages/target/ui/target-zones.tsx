import type { CanvasZone } from "@/shared/ui/canvas";

import { activeInterview, useLatestInterviews } from "../model/latest-interviews";
import { sessionWindowWidths } from "../model/session-windows";
import { goalZoneWidth } from "../model/setup-chat-state";
import { GoalZone } from "./goal-zone";
import type { GoalZoneProps } from "./goal-zone";
import { MockInterviews } from "./mock-interview/mock-interviews";

/** The id of the «Сессии» zone: the canvas moves to it when a Mock interview starts. */
export const sessionsZoneId = "sessions";

/**
 * The zones of the Target's canvas. A slice adds its widget to a zone's `content` here and leaves
 * the canvas itself unchanged. «Сессии» stands to the right once the Target has a Mock interview.
 */
export function targetZones(goal: GoalZoneProps, sessionsShown: boolean): CanvasZone[] {
  const { target } = goal;
  const goalZone: CanvasZone = {
    id: "goal",
    title: "Цель",
    width: goalZoneWidth(goal.chat),
    content: <GoalZone zone={goal} />,
  };
  if (!sessionsShown) {
    return [goalZone];
  }
  return [
    goalZone,
    {
      id: sessionsZoneId,
      title: "Сессии",
      hint: "моки по этой цели",
      width: sessionWindowWidths.interviewer + sessionWindowWidths.question + 72,
      minHeight: 640,
      content: <MockInterviews targetId={target.id} />,
    },
  ];
}

/**
 * Whether «Сессии» is on the canvas, and the Mock interview that runs or is paused now: the canvas
 * moves to the zone when that one changes, such as when the Candidate starts a Mock interview.
 */
export function useSessionsZone(targetId: string) {
  const { latest } = useLatestInterviews(targetId);
  return {
    shown: (latest.data?.length ?? 0) > 0,
    activeId: activeInterview(latest.data)?.id ?? "",
  };
}
