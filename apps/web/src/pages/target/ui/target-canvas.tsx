import { useEffect, useMemo } from "react";

import { TopBar } from "@/widgets/top-bar";
import type { TargetView } from "@/shared/api";
import { rememberTarget } from "@/shared/lib";
import { Canvas } from "@/shared/ui/canvas";

import { useSetupChat } from "../model/setup-chat-state";
import { SidePanel, useSidePanel } from "./side-panel";
import { sessionsZoneId, targetZones, useSessionsZone } from "./target-zones";

export function TargetCanvas({ target }: { target: TargetView }) {
  const [chat, setChat] = useSetupChat();
  const panel = useSidePanel();
  const sessions = useSessionsZone(target.id);
  const { onQuestions, onReport, onAnswerReport } = panel;
  const zones = useMemo(
    () =>
      targetZones(
        { target, chat, onChat: setChat, onQuestions, onReport, onAnswerReport },
        sessions.shown,
      ),
    [target, chat, setChat, sessions.shown, onQuestions, onReport, onAnswerReport],
  );
  useEffect(() => {
    rememberTarget(target.id);
  }, [target.id]);
  return (
    <>
      <TopBar target={target} />
      <main>
        {/* The view moves to «Сессии» when a Mock interview starts, pauses or ends. */}
        <Canvas
          zones={zones}
          label="Холст цели"
          focus={{ zone: sessionsZoneId, key: sessions.activeId }}
        />
        <SidePanel targetId={target.id} panel={panel} />
      </main>
    </>
  );
}
