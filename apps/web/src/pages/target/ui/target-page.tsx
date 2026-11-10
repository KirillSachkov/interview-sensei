import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { TopBar } from "@/widgets/top-bar";
import { fetchTarget } from "@/shared/api";
import type { TargetView } from "@/shared/api";
import { rememberTarget } from "@/shared/lib";
import { Canvas } from "@/shared/ui/canvas";

import { useSetupChat } from "../model/setup-chat-state";
import { SidePanel, useSidePanel } from "./side-panel";
import { TargetNotFound } from "./target-not-found";
import { targetZones, useSessionsZone } from "./target-zones";

function TargetCanvas({ target }: { target: TargetView }) {
  const [chat, setChat] = useSetupChat();
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
    [
      target,
      chat,
      setChat,
      sessions.requestStart,
      sessions.zone,
      onQuestions,
      onReport,
      onAnswerReport,
    ],
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
