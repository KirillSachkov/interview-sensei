import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchLatestInterviews } from "@/shared/api";
import type { InterviewView } from "@/shared/api";

import { InterviewArea } from "./interview-area";
import { InterviewResult } from "./interview-result";
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
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: interviewsKey(targetId) });
  }, [queryClient, targetId]);
  const started = (interview: InterviewView) => {
    queryClient.setQueryData(interviewsKey(targetId), [interview, ...(latest.data ?? [])]);
  };
  return { latest, refresh, started };
}

/**
 * The «Сессии» zone: the running Mock interview, or «Начать мок» with the result of the last one.
 * A Target has at most one running Mock interview.
 */
export function MockInterviews({ targetId }: { targetId: string }) {
  const { latest, refresh, started } = useLatestInterviews(targetId);
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
        <LastInterview current={current} targetId={targetId} onStarted={started} />
      )}
    </div>
  );
}

/** «Начать мок» with the result of the last Mock interview, or the empty state without one. */
function LastInterview({
  current,
  targetId,
  onStarted,
}: {
  current: InterviewView | undefined;
  targetId: string;
  onStarted: (interview: InterviewView) => void;
}) {
  return (
    <>
      <StartMock targetId={targetId} onStarted={onStarted} />
      {current === undefined ? (
        <p className="placeholder muted">
          Сессий пока нет. Здесь появятся мок-собеседования по цели.
        </p>
      ) : (
        <InterviewResult interview={current} />
      )}
    </>
  );
}
