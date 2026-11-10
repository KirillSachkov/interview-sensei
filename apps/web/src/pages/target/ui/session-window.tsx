import type { ReactNode } from "react";

import { useSessionWindow } from "../model/session-windows";
import { ChatResizeHandle } from "./chat-resize";

const resizeLabels = { question: "карточки вопроса", interviewer: "интервьюера", thread: "ветки" };

/** One frame and resize contract for all windows in a mock interview. */
export function SessionWindow({
  kind,
  id,
  label,
  className,
  children,
}: {
  kind: "question" | "interviewer" | "thread";
  id: string;
  label: string;
  className: string;
  children: ReactNode;
}) {
  const window = useSessionWindow(kind, id);
  const Element = kind === "question" ? "article" : "aside";
  return (
    <Element
      className={`${className} resizable-window`}
      style={window.style}
      aria-label={label}
      data-discuss-scope={kind === "question" ? "" : undefined}
      data-side-thread={kind === "thread" ? id : undefined}
    >
      {children}
      <ChatResizeHandle
        size={window.size}
        limit={window.limit}
        onResize={window.handleResize}
        label={resizeLabels[kind]}
      />
    </Element>
  );
}
