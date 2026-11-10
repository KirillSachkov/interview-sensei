import { createContext, useCallback, useContext, useState } from "react";

import type { ChatSize } from "./chat-size";

type WindowKind = "interviewer" | "question" | "thread";
type Sizes = Readonly<Record<string, ChatSize>>;

const defaults = {
  interviewer: { width: 420, height: 420 },
  question: { width: 640, height: 0 },
  thread: { width: 560, height: 420 },
};
const minimum = {
  interviewer: { width: 360, height: 340 },
  question: { width: 480, height: 300 },
  thread: { width: 420, height: 340 },
};
const maximum = {
  interviewer: { width: 760, height: 1000 },
  question: { width: 1100, height: 1100 },
  thread: { width: 960, height: 1000 },
};

const clamp = (value: number, least: number, most: number) =>
  Math.min(most, Math.max(least, Math.round(value)));

function limit(kind: WindowKind, size: ChatSize): ChatSize {
  return {
    width: clamp(size.width, minimum[kind].width, maximum[kind].width),
    height: clamp(size.height, minimum[kind].height, maximum[kind].height),
  };
}

/** Browser-only presentation sizes, scoped to the Target; no interview data goes here. */
function decoded(value: unknown): Sizes {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const result: Record<string, ChatSize> = {};
  for (const [name, entry] of Object.entries(value)) {
    const size: unknown = entry;
    if (
      typeof size === "object" &&
      size !== null &&
      "width" in size &&
      "height" in size &&
      typeof size.width === "number" &&
      Number.isFinite(size.width) &&
      typeof size.height === "number" &&
      Number.isFinite(size.height)
    ) {
      result[name] = { width: size.width, height: size.height };
    }
  }
  return result;
}

function stored(key: string): Sizes {
  try {
    return decoded(JSON.parse(globalThis.localStorage.getItem(key) ?? "null"));
  } catch {
    return {};
  }
}

/** One owner for sizes, so the zone and all neighboring rows follow each resize together. */
export function useSessionWindows(targetId: string) {
  const key = `interview-sensei:session-windows:${targetId}`;
  const [sizes, setSizes] = useState(() => stored(key));
  const resize = useCallback(
    (id: string, size: ChatSize) => {
      setSizes((current) => {
        const next = { ...current, [id]: size };
        try {
          globalThis.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // A full or unavailable browser store does not stop resizing.
        }
        return next;
      });
    },
    [key],
  );
  const widest = (kind: WindowKind) =>
    Math.max(
      defaults[kind].width,
      ...Object.entries(sizes)
        .filter(([id]) => id.startsWith(`${kind}:`))
        .map(([_id, size]) => limit(kind, size).width),
    );
  return { sizes, resize, width: widest("interviewer") + widest("question") + 72 };
}

export const SessionWindows = createContext<ReturnType<typeof useSessionWindows> | null>(null);

/** The same bounded size and resize contract for an interviewer, question card or Side thread. */
export function useSessionWindow(kind: WindowKind, id: string) {
  const context = useContext(SessionWindows);
  const name = `${kind}:${id}`;
  const saved = context?.sizes[name];
  const size = saved === undefined ? defaults[kind] : limit(kind, saved);
  return {
    size,
    limit: (next: ChatSize) => limit(kind, next),
    handleResize: (next: ChatSize) => context?.resize(name, limit(kind, next)),
    style: { width: size.width, height: size.height === 0 ? undefined : size.height },
  };
}
