import { useEffect, useMemo } from "react";

import { TopBar } from "@/widgets/top-bar";
import type { TargetView } from "@/shared/api";
import { rememberTarget } from "@/shared/lib";
import { Canvas } from "@/shared/ui/canvas";

import { SessionWindows, useSessionWindows } from "../model/session-windows";
import { useSetupChat } from "../model/setup-chat-state";
import { SidePanel, useSidePanel } from "./side-panel";
import { sessionsZoneId, targetZones, useSessionsZone } from "./target-zones";

export function TargetCanvas({ target }: { target: TargetView }) {
  const [chat, setChat] = useSetupChat();
  const panel = useSidePanel();
  const windows = useSessionWindows(target.id);
  const sessions = useSessionsZone(target.id);
  const { onQuestions, onReport, onAnswerReport } = panel;
  const zones = useMemo(
    () =>
      targetZones(
        { target, chat, onChat: setChat, onQuestions, onReport, onAnswerReport },
        sessions.shown,
        windows.width,
      ),
    [target, chat, setChat, sessions.shown, windows.width, onQuestions, onReport, onAnswerReport],
  );
  useEffect(() => {
    rememberTarget(target.id);
  }, [target.id]);
  return (
    <>
      <TopBar target={target} />
      <main>
        {/* The view moves to «Сессии» when a Mock interview starts, pauses or ends. */}
        <SessionWindows value={windows}>
          <Canvas
            zones={zones}
            label="Холст цели"
            focus={{ zone: sessionsZoneId, key: sessions.activeId }}
          />
        </SessionWindows>
        <SidePanel targetId={target.id} panel={panel} />
      </main>
    </>
  );
}
