import { useReactFlow } from "@xyflow/react";
import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";

import { limitedChatSize } from "../model/chat-size";
import type { ChatSize } from "../model/chat-size";

interface ResizeProps {
  size: ChatSize;
  onResize: (size: ChatSize) => void;
  limit?: (size: ChatSize) => ChatSize;
  label?: string;
}

function measured(element: HTMLElement, fallback: ChatSize): ChatSize {
  return {
    width: element.parentElement?.offsetWidth ?? fallback.width,
    height: element.parentElement?.offsetHeight ?? fallback.height,
  };
}

function keyboardSize(event: KeyboardEvent<HTMLButtonElement>, size: ChatSize): ChatSize | null {
  const shift = {
    ArrowRight: { width: 32, height: 0 },
    ArrowLeft: { width: -32, height: 0 },
    ArrowDown: { width: 0, height: 32 },
    ArrowUp: { width: 0, height: -32 },
  };
  const step = Object.entries(shift).find(([key]) => key === event.key)?.[1];
  if (step === undefined) {
    return null;
  }
  event.preventDefault();
  const current = measured(event.currentTarget, size);
  return { width: current.width + step.width, height: current.height + step.height };
}

function useResizeGesture({ size, onResize, limit = limitedChatSize }: ResizeProps) {
  const flow = useReactFlow();
  const drag = useRef<{ left: number; top: number; size: ChatSize } | null>(null);
  const handleStart = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      left: event.clientX,
      top: event.clientY,
      size: measured(event.currentTarget, size),
    };
  };
  const handleMove = (event: PointerEvent) => {
    if (drag.current !== null) {
      onResize(
        limit({
          width: drag.current.size.width + (event.clientX - drag.current.left) / flow.getZoom(),
          height: drag.current.size.height + (event.clientY - drag.current.top) / flow.getZoom(),
        }),
      );
    }
  };
  const handleEnd = () => {
    drag.current = null;
  };
  return { handleStart, handleMove, handleEnd };
}

/** A shared canvas-aware resize corner: drag it or use arrow keys, always within the limits. */
export function ChatResizeHandle(props: ResizeProps) {
  const { size, onResize, limit = limitedChatSize, label = "чата" } = props;
  const { handleStart, handleMove, handleEnd } = useResizeGesture(props);
  return (
    <button
      type="button"
      className="chat-resize nodrag nopan"
      aria-label={`Изменить размер ${label}`}
      title="Потяните за угол или используйте стрелки на клавиатуре"
      onKeyDown={(event) => {
        const next = keyboardSize(event, size);
        if (next !== null) {
          onResize(limit(next));
        }
      }}
      onPointerDown={handleStart}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
    />
  );
}
