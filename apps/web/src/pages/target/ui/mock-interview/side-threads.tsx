import { useCallback, useId, useState } from "react";

import type { InterviewView, QuestionCard } from "@/shared/api";

import { SideThreadChat } from "./side-thread-chat";

/** Where the arrows leave the question card: this far below its top, in canvas pixels. */
const cardAnchor = 24;
/** Where an arrow enters its Side thread: this far below the thread's top, at its title. */
const threadAnchor = 20;

interface ArrowLayout {
  readonly width: number;
  readonly height: number;
  /** The y of each Side thread's entry, from the top of the column. */
  readonly entries: readonly number[];
}

/** The arrows' layout in the column now. Layout sizes ignore the canvas zoom: canvas pixels. */
function measure(column: HTMLElement): ArrowLayout {
  const threads = [...column.querySelectorAll<HTMLElement>(":scope > .side-thread")];
  return {
    width: column.querySelector(".side-thread-arrows")?.clientWidth ?? 0,
    height: column.scrollHeight,
    entries: threads.map((thread) => thread.offsetTop + threadAnchor),
  };
}

/**
 * The column's ref and the arrows' layout, measured again whenever the column changes size: a
 * thread is added, deleted or grows with its chat.
 */
function useArrowLayout() {
  const [layout, setLayout] = useState<ArrowLayout | null>(null);
  // React 19 calls the cleanup instead of passing null.
  const column = useCallback((element: HTMLDivElement) => {
    const observer = new ResizeObserver(() => {
      setLayout(measure(element));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return { column, layout };
}

/**
 * The arrows from the question to its Side threads: each goes right from the card, bends down at
 * the middle of the gutter and enters its thread at the title. They carry no label.
 */
function Arrows({ layout }: { layout: ArrowLayout | null }) {
  const marker = useId();
  if (layout === null) {
    return null;
  }
  const { width, height, entries } = layout;
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
          d={`M 0 ${cardAnchor} H ${bend} V ${entry} H ${width - 1}`}
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
      {threads.map((thread) => (
        <SideThreadChat key={thread.id} thread={thread} number={number} />
      ))}
    </div>
  );
}
