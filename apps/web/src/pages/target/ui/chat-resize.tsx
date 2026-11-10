import { useReactFlow } from "@xyflow/react";
import { useRef } from "react";
import type { PointerEvent } from "react";

import { limitedChatSize } from "../model/chat-size";
import type { ChatSize } from "../model/chat-size";

/**
 * The corner of the setup chat that the Candidate drags to resize it. The pointer moves in screen
 * pixels and the chat lives on the canvas, so the drag divides by the canvas scale. The size stays
 * inside its limits; the zone and the widgets beside the chat follow it.
 */
export function ChatResizeHandle({
  size,
  onResize,
}: {
  size: ChatSize;
  onResize: (size: ChatSize) => void;
}) {
  const flow = useReactFlow();
  const drag = useRef<{ left: number; top: number; size: ChatSize } | null>(null);
  const move = (event: PointerEvent) => {
    if (drag.current === null) {
      return;
    }
    const zoom = flow.getZoom();
    onResize(
      limitedChatSize({
        width: drag.current.size.width + (event.clientX - drag.current.left) / zoom,
        height: drag.current.size.height + (event.clientY - drag.current.top) / zoom,
      }),
    );
  };
  return (
    <div
      className="chat-resize nodrag nopan"
      // A pointer shortcut: «Развернуть» resizes the chat from the keyboard.
      aria-hidden="true"
      title="Потяните, чтобы изменить размер чата"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { left: event.clientX, top: event.clientY, size };
      }}
      onPointerMove={move}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}
