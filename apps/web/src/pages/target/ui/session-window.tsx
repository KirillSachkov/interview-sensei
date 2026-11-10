import type { ReactNode } from "react";

import { sessionWindowWidths } from "../model/session-windows";

/** One content-sized frame for every window in a mock interview. */
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
  const Element = kind === "question" ? "article" : "aside";
  return (
    <Element
      className={`${className} session-window`}
      style={{ width: sessionWindowWidths[kind] }}
      aria-label={label}
      data-discuss-scope={kind === "question" ? "" : undefined}
      data-side-thread={kind === "thread" ? id : undefined}
    >
      {children}
    </Element>
  );
}
