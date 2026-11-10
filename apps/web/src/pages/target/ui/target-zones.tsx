import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { fetchLatestInterviews } from "@/shared/api";
import type { CanvasZone } from "@/shared/ui/canvas";

import { goalZoneWidth } from "../model/setup-chat-state";
import { GoalZone } from "./goal-zone";
import type { GoalZoneProps } from "./goal-zone";
import { MockInterviews } from "./mock-interview/mock-interviews";

/**
 * The zones of the Target's canvas. A slice adds its widget to a zone's `content` here and leaves
 * the canvas itself unchanged. «Сессии» stands to the right once the Target has a Mock interview
 * or the Candidate pressed «Начать мок-собеседование».
 */
export function targetZones(goal: GoalZoneProps, sessions: SessionsZone): CanvasZone[] {
  const { target } = goal;
  const goalZone: CanvasZone = {
    id: "goal",
    title: "Цель",
    width: goalZoneWidth(goal.chat),
    content: <GoalZone zone={goal} />,
  };
  if (!sessions.shown) {
    return [goalZone];
  }
  return [
    goalZone,
    {
      id: "sessions",
      title: "Сессии",
      hint: "моки по этой цели",
      width: 1080,
      minHeight: 640,
      content: <MockInterviews targetId={target.id} startRequest={sessions.startRequest} />,
    },
  ];
}

interface SessionsZone {
  readonly shown: boolean;
  /** Grows with each «Начать мок-собеседование»: the zone opens its start dialog. */
  readonly startRequest: number;
}

/** Whether «Сессии» is on the canvas, and the requests to start a Mock interview from «Цель». */
export function useSessionsZone(targetId: string) {
  const [startRequest, setStartRequest] = useState(0);
  const latest = useQuery({
    queryKey: ["targets", targetId, "interviews"],
    queryFn: async () => fetchLatestInterviews(targetId),
  });
  const shown = startRequest > 0 || (latest.data?.length ?? 0) > 0;
  return {
    zone: useMemo(() => ({ shown, startRequest }), [shown, startRequest]),
    requestStart: useCallback(() => {
      setStartRequest((current) => current + 1);
    }, []),
  };
}
