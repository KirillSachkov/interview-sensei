import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { fetchLatestInterviews } from "@/shared/api";
import type { InterviewView } from "@/shared/api";

import { InterviewArea } from "./interview-area";
import { PastSessions } from "./past-sessions";
import { ShownSession } from "./shown-session";
import { StartMock } from "./start-form";
import "./mock-interview.css";

const interviewsKey = (targetId: string) => ["targets", targetId, "interviews"];

/** The Target's newest Mock interviews, and how the zone updates them. */
function useLatestInterviews(targetId: string) {
  const queryClient = useQueryClient();
  const latest = useQuery({
    queryKey: interviewsKey(targetId),
    queryFn: async () => fetchLatestInterviews(targetId),
  });
  // An ended Mock interview changes the Readiness and the session history too.
  const refresh = useCallback(() => {
    for (const queryKey of [
      interviewsKey(targetId),
      ["progress", targetId],
      ["history", targetId],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient, targetId]);
  const started = (interview: InterviewView) => {
    queryClient.setQueryData(interviewsKey(targetId), [interview, ...(latest.data ?? [])]);
  };
  return { latest, refresh, started };
}

/** Which ended session the canvas shows; at first the newest one, while none runs. */
function useShownSession(latest: readonly InterviewView[] | undefined) {
  const [chosen, setChosen] = useState<{ id: string | null; focus: number } | null>(null);
  const [current] = latest ?? [];
  const newest = current === undefined || current.status === "running" ? null : current.id;
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
    reset: () => {
      setChosen(null);
    },
  };
}

/**
 * The «Сессии» zone: the running Mock interview, or «Начать мок»; then the last ended sessions as
 * collapsed cards, and the one the Candidate opened, the newest by default. A Target has at most
 * one running Mock interview.
 */
export function MockInterviews({ targetId }: { targetId: string }) {
  const { latest, refresh, started } = useLatestInterviews(targetId);
  const shown = useShownSession(latest.data);
  if (latest.isError) {
    return <p role="alert">Сессии не загрузились: {latest.error.message}</p>;
  }
  if (latest.data === undefined) {
    return null;
  }
  const [current] = latest.data;
  return (
    <div className="mock-zone">
      {current?.status === "running" ? (
        <InterviewArea key={current.id} interview={current} onEnded={refresh} />
      ) : (
        <StartMock
          targetId={targetId}
          difficulty={current?.difficulty ?? "as_is"}
          onStarted={(interview) => {
            shown.reset();
            started(interview);
          }}
        />
      )}
      {current === undefined ? (
        <p className="placeholder muted">
          Сессий пока нет. Здесь появятся мок-собеседования по цели.
        </p>
      ) : null}
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
