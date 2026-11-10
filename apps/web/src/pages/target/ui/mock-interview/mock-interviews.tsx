import { useState } from "react";

import type { InterviewView } from "@/shared/api";

import { activeInterview, useLatestInterviews } from "../../model/latest-interviews";
import { InterviewArea } from "./interview-area";
import { PastSessions } from "./past-sessions";
import { ShownSession } from "./shown-session";
import "./mock-interview.css";

/** Which ended session the canvas shows; at first the newest one, while none runs. */
function useShownSession(latest: readonly InterviewView[] | undefined) {
  const [chosen, setChosen] = useState<{ id: string | null; focus: number } | null>(null);
  const [current] = latest ?? [];
  const newest =
    current === undefined || current.status === "running" || current.status === "paused"
      ? null
      : current.id;
  const handleShow = (id: string | null, from: "card" | "history") => {
    setChosen((previous) => ({
      id,
      focus: from === "history" ? (previous?.focus ?? 0) + 1 : (previous?.focus ?? 0),
    }));
  };
  return {
    shownId: chosen === null ? newest : chosen.id,
    focus: chosen?.focus ?? 0,
    handleShow,
  };
}

/**
 * The «Сессии» zone: the running or paused Mock interview, then the last ended sessions as
 * collapsed cards, and the one the Candidate opened, the newest by default. A Target has at most
 * one Mock interview that runs or is paused. «Начать мок-собеседование» of the «Цель» zone starts
 * the next one.
 */
export function MockInterviews({ targetId }: { targetId: string }) {
  const { latest, refresh } = useLatestInterviews(targetId);
  const shown = useShownSession(latest.data);
  if (latest.isError) {
    return <p role="alert">Сессии не загрузились: {latest.error.message}</p>;
  }
  if (latest.data === undefined) {
    return null;
  }
  const active = activeInterview(latest.data);
  return (
    <div className="mock-zone">
      {active === null ? null : (
        <InterviewArea key={active.id} interview={active} onChanged={refresh} />
      )}
      <PastSessions targetId={targetId} shownId={shown.shownId} onShow={shown.handleShow} />
      {shown.shownId === null ? null : (
        <ShownSession
          key={shown.shownId}
          id={shown.shownId}
          latest={latest.data}
          focus={shown.focus}
        />
      )}
    </div>
  );
}
