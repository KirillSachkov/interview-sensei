import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TopBar } from "@/widgets/top-bar";
import { fetchLatestInterviews, fetchTarget } from "@/shared/api";
import type { TargetView } from "@/shared/api";
import { rememberTarget } from "@/shared/lib";
import { Canvas } from "@/shared/ui/canvas";
import type { CanvasZone } from "@/shared/ui/canvas";

import { GoalZone, goalZoneWidth } from "./goal-zone";
import type { GoalZoneProps, SetupChatState } from "./goal-zone";
import { MockInterviews } from "./mock-interview/mock-interviews";
import { SidePanel, useSidePanel } from "./side-panel";

/**
 * The zones of the Target's canvas. A slice adds its widget to a zone's `content` here and leaves
 * the canvas itself unchanged. «Сессии» stands to the right once the Target has a Mock interview
 * or the Candidate pressed «Начать мок-собеседование».
 */
function targetZones(goal: GoalZoneProps, sessions: SessionsZone): CanvasZone[] {
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
function useSessionsZone(targetId: string) {
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

function TargetCanvas({ target }: { target: TargetView }) {
  // A draft Target opens with its setup chat: the agent starts the onboarding there.
  const [chat, setChat] = useState<SetupChatState>(target.status === "draft" ? "open" : "closed");
  const panel = useSidePanel();
  const sessions = useSessionsZone(target.id);
  const { onQuestions, onReport, onAnswerReport } = panel;
  const zones = useMemo(
    () =>
      targetZones(
        {
          target,
          chat,
          onChat: setChat,
          onStartMock: sessions.requestStart,
          onQuestions,
          onReport,
          onAnswerReport,
        },
        sessions.zone,
      ),
    [target, chat, sessions.requestStart, sessions.zone, onQuestions, onReport, onAnswerReport],
  );
  useEffect(() => {
    rememberTarget(target.id);
  }, [target.id]);
  return (
    <>
      <TopBar target={target} />
      <main>
        {/* The view fits again when «Сессии» appears or a Mock interview is asked for. */}
        <Canvas
          zones={zones}
          label="Холст цели"
          fitKey={`${sessions.zone.shown}-${sessions.zone.startRequest}`}
        />
        <SidePanel targetId={target.id} panel={panel} />
      </main>
    </>
  );
}

function TargetNotFound() {
  return (
    <>
      <TopBar target={null} />
      <main className="centered">
        <section className="island empty-state" aria-labelledby="not-found-title">
          <h1 id="not-found-title">Цель не найдена</h1>
          <p>Такой цели нет: адрес устарел или цель удалена.</p>
          <Link to="/" className="button primary big">
            К холсту
          </Link>
        </section>
      </main>
    </>
  );
}

/** The canvas of one Target, or a message when the address names no Target. */
export function TargetPage({ targetId }: { targetId: string }) {
  const target = useQuery({
    queryKey: ["targets", targetId],
    queryFn: async () => fetchTarget(targetId),
  });
  if (target.isError) {
    return (
      <main className="centered">
        <p role="alert">Цель не загрузилась: {target.error.message}</p>
      </main>
    );
  }
  if (target.data === undefined) {
    return null;
  }
  return target.data === null ? <TargetNotFound /> : <TargetCanvas target={target.data} />;
}
