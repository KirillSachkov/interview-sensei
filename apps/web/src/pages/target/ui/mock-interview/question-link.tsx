import { useLayoutEffect, useRef, useState } from "react";

import { ConnectionArrows } from "./connection-arrows";

/** The complete gap between two cards, including room taken by a tall chat in the earlier row. */
function measure(row: HTMLElement) {
  const previous = row.previousElementSibling?.querySelector<HTMLElement>(".question-card");
  const current = row.querySelector<HTMLElement>(":scope > .question-card");
  if (previous === undefined || previous === null || current === null) {
    return null;
  }
  const earlierRow = previous.parentElement;
  const height =
    row.offsetTop +
    current.offsetTop -
    ((earlierRow?.offsetTop ?? 0) + previous.offsetTop + previous.offsetHeight);
  return {
    height: Math.max(0, height),
    left: current.offsetLeft + 16,
    top: current.offsetTop - height,
  };
}

function watched(row: HTMLElement): Element[] {
  return [
    row,
    row.previousElementSibling,
    row.parentElement,
    ...(row.parentElement?.querySelectorAll(".interviewer") ?? []),
    row.querySelector(":scope > .question-card"),
    row.previousElementSibling?.querySelector(".question-card"),
  ].filter((element): element is Element => element !== null && element !== undefined);
}

/** A live connector that follows both cards when either row or its chats changes size. */
export function QuestionLink() {
  const element = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ReturnType<typeof measure>>(null);
  useLayoutEffect(() => {
    const row = element.current?.parentElement;
    const update = () => {
      if (row !== null && row !== undefined) {
        setLayout(measure(row));
      }
    };
    const observer = new ResizeObserver(update);
    if (row !== null && row !== undefined) {
      watched(row).forEach((target) => observer.observe(target));
    }
    update();
    return () => {
      observer.disconnect();
    };
  }, []);
  return (
    <div
      ref={element}
      className="question-link"
      data-question-link=""
      aria-hidden="true"
      style={
        layout === null ? undefined : { left: layout.left, top: layout.top, height: layout.height }
      }
    >
      {layout === null ? null : (
        <ConnectionArrows width={32} height={layout.height} paths={[`M16 0 V${layout.height}`]} />
      )}
    </div>
  );
}
