import { useQuery } from "@tanstack/react-query";
import { useReactFlow } from "@xyflow/react";
import { useEffect, useRef } from "react";

import { fetchInterview } from "@/shared/api";
import type { InterviewView } from "@/shared/api";

import { InterviewResult } from "./interview-result";

/** How far below the top of the view the shown session starts, in screen pixels. */
const topMargin = 140;

/** Moves the canvas so that the element's top sits near the top of the view, at the same scale. */
function useCenterOnCanvas() {
  const flow = useReactFlow();
  return (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const zoom = flow.getZoom();
    const top = flow.screenToFlowPosition({
      // oxlint-disable-next-line eslint/id-length -- React Flow names the coordinates x and y.
      x: rect.left + rect.width / 2,
      // oxlint-disable-next-line eslint/id-length -- React Flow names the coordinates x and y.
      y: rect.top,
    });
    const middle = top.y + (globalThis.innerHeight / 2 - topMargin) / zoom;
    void flow.setCenter(top.x, middle, { zoom, duration: 300 });
  };
}

/**
 * An ended session on the canvas: one of the newest from `latest`, or one the server sends when the
 * Candidate opens it from «История сессий». `focus` changes when the canvas should move to it.
 */
export function ShownSession({
  id,
  latest,
  focus,
}: {
  id: string;
  latest: readonly InterviewView[];
  focus: number;
}) {
  const known = latest.find((interview) => interview.id === id);
  const fetched = useQuery({
    queryKey: ["interviews", id, "view"],
    queryFn: async () => fetchInterview(id),
    enabled: known === undefined,
  });
  const view = known ?? fetched.data;
  const element = useRef<HTMLDivElement>(null);
  const center = useCenterOnCanvas();
  const ready = view !== undefined;
  useEffect(() => {
    if (focus > 0 && ready && element.current !== null) {
      center(element.current);
    }
    // Moves the canvas once per request, when the session is there.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- `center` is new on every render
  }, [focus, ready]);
  if (fetched.isError) {
    return <p role="alert">Сессия не загрузилась: {fetched.error.message}</p>;
  }
  return (
    <div ref={element}>{view === undefined ? null : <InterviewResult interview={view} />}</div>
  );
}
