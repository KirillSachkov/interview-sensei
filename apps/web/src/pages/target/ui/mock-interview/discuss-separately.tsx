import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";

import { openSideThread } from "@/shared/api";
import type { SideThreadOrigin } from "@/shared/api";

import { useRefreshSideThreads } from "./side-thread-refresh";
import { useRevealThread } from "./use-reveal-thread";

/** The selected text inside the question, message or Debrief that owns the button. */
function selectedFragment(button: HTMLElement): string | null {
  const selection = globalThis.getSelection();
  const text = selection?.toString().trim() ?? "";
  const scope = button.closest("[data-discuss-scope]");
  return text !== "" && scope?.contains(selection?.anchorNode ?? null) === true ? text : null;
}

/** The selected fragment of a Side thread as a quote; nothing without one. */
export function FragmentQuote({ fragment }: { fragment: string | null }) {
  return fragment === null ? null : (
    <blockquote className="discuss-fragment">
      <span className="muted">Фрагмент: </span>
      {fragment}
    </blockquote>
  );
}

/** Opens a chat to the right in one click; the Candidate asks their question there. */
export function DiscussSeparately({
  interviewId,
  origin,
}: {
  interviewId: string;
  origin: SideThreadOrigin;
}) {
  const fragment = useRef<string | null>(null);
  const refresh = useRefreshSideThreads(interviewId);
  const opening = useMutation({
    mutationFn: async () =>
      openSideThread(interviewId, { origin, fragment: fragment.current, question: null }),
    onSuccess: refresh,
  });
  useRevealThread(opening.data?.id);
  return (
    <>
      <button
        type="button"
        className="ghost discuss-button"
        aria-label="Обсудить отдельно"
        title="Открыть обсуждение справа"
        disabled={opening.isPending}
        onPointerDown={(event) => {
          fragment.current = selectedFragment(event.currentTarget);
          event.preventDefault();
        }}
        onClick={(event) => {
          fragment.current = selectedFragment(event.currentTarget) ?? fragment.current;
          opening.mutate();
        }}
      >
        {opening.isPending ? "Открываем…" : "Обсудить"}
      </button>
      {opening.isError ? <p role="alert">Ветка не открылась: {opening.error.message}</p> : null}
    </>
  );
}
