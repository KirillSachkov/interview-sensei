import { useCallback, useId, useState } from "react";

import type { InterviewView, QuestionCard } from "@/shared/api";

import { SideThreadChat } from "./side-thread-chat";

/** Where an arrow enters its Side thread: this far below the thread's top, at its title. */
const threadAnchor = 20;

interface ArrowLayout {
  readonly width: number;
  readonly height: number;
  /** Center of the question card's branch port, from the top of the row. */
  readonly start: number;
  /** The y of each Side thread's entry, from the top of the column. */
  readonly entries: readonly number[];
}

/** The arrows' layout in the column now. Layout sizes ignore the canvas zoom: canvas pixels. */
function measure(column: HTMLElement): ArrowLayout {
  const threads = [...column.querySelectorAll<HTMLElement>(":scope > .side-thread")];
  const port = column.parentElement?.querySelector<HTMLElement>(".question-card .branch-trigger");
  return {
    width: column.querySelector(".side-thread-arrows")?.clientWidth ?? 0,
    height: column.scrollHeight,
    start: port === null || port === undefined ? 24 : port.offsetTop + port.offsetHeight / 2,
    entries: threads.map((thread) => thread.offsetTop + threadAnchor),
  };
}

/**
 * The column's ref and the arrows' layout, measured again whenever the column changes size: a
 * thread is added, deleted or grows with its chat, or the question card changes height.
 */
function useArrowLayout() {
  const [layout, setLayout] = useState<ArrowLayout | null>(null);
  // React 19 calls the cleanup instead of passing null.
  const column = useCallback((element: HTMLDivElement) => {
    const observer = new ResizeObserver(() => {
      setLayout(measure(element));
    });
    observer.observe(element);
    const card = element.parentElement?.querySelector(":scope > .question-card");
    if (card !== null && card !== undefined) {
      observer.observe(card);
    }
    return () => {
      observer.disconnect();
    };
  }, []);
  return { column, layout };
}

/**
 * The arrows from the question to its Side threads: each goes right from the card, bends at
 * the middle of the gutter and enters its thread at the title. They carry no label.
 */
function Arrows({ layout }: { layout: ArrowLayout | null }) {
  const marker = useId();
  if (layout === null) {
    return null;
  }
  const { width, height, entries, start } = layout;
  const bend = width / 2;
  return (
    <svg width={width} height={height} aria-hidden="true">
      <defs>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" className="side-thread-arrowhead" />
        </marker>
      </defs>
      {entries.map((entry) => (
        <path
          key={entry}
          className="side-thread-arrow"
          d={`M 0 ${start} H ${bend} V ${entry} H ${width - 1}`}
          markerEnd={`url(#${marker})`}
        />
      ))}
    </svg>
  );
}

/**
 * The Side threads of the question, to the right of its card in the order they were opened, with
 * a bent arrow to each. `number` is the question's number in the Mock interview.
 */
export function SideThreads({
  view,
  card,
  number,
}: {
  view: InterviewView;
  card: QuestionCard;
  number: number;
}) {
  const threads = view.sideThreads.filter((thread) => thread.askedQuestionId === card.id);
  const { column, layout } = useArrowLayout();
  return threads.length === 0 ? null : (
    <div className="side-threads" ref={column}>
      <div className="side-thread-arrows">
        <Arrows layout={layout} />
      </div>
      {/* A continued Side thread gets a new session: its chat follows that session afresh. */}
      {threads.map((thread) => (
        <SideThreadChat key={thread.sessionId} thread={thread} number={number} />
      ))}
    </div>
  );
}
