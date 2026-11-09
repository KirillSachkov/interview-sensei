import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { TopBar } from "@/widgets/top-bar";
import { fetchTarget } from "@/shared/api";
import type { TargetView } from "@/shared/api";
import { rememberTarget } from "@/shared/lib";
import { Canvas } from "@/shared/ui/canvas";
import type { CanvasZone } from "@/shared/ui/canvas";

import { GoalZone } from "./goal-zone";
import { SessionsPlaceholder } from "./sessions-placeholder";
import { SetupChat } from "./setup-chat";

/**
 * The zones of the Target's canvas. A slice adds its widget to a zone's `content` here and leaves
 * the canvas itself unchanged.
 */
function targetZones(target: TargetView, openSetup: () => void): CanvasZone[] {
  return [
    {
      id: "goal",
      title: "Цель",
      width: 440,
      content: <GoalZone target={target} onSetup={openSetup} />,
    },
    {
      id: "sessions",
      title: "Сессии",
      hint: "моки по этой цели",
      width: 1080,
      minHeight: 640,
      content: <SessionsPlaceholder />,
    },
  ];
}

function TargetCanvas({ target }: { target: TargetView }) {
  // A draft Target opens with its setup chat: the agent starts the onboarding there.
  const [setupOpen, setSetupOpen] = useState(target.status === "draft");
  const zones = useMemo(
    () =>
      targetZones(target, () => {
        setSetupOpen(true);
      }),
    [target],
  );
  useEffect(() => {
    rememberTarget(target.id);
  }, [target.id]);
  return (
    <>
      <TopBar target={target} />
      <main>
        <Canvas zones={zones} label="Холст цели" />
        {setupOpen ? (
          <SetupChat
            targetId={target.id}
            onClose={() => {
              setSetupOpen(false);
            }}
          />
        ) : null}
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
