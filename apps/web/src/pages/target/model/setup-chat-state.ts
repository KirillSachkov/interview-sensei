import { useCallback, useState } from "react";

import {
  defaultChatSize,
  isLargest,
  largestChatSize,
  rememberChatSize,
  storedChatSize,
} from "./chat-size";
import type { ChatSize } from "./chat-size";

/** The setup chat in the middle of the zone: its size. */
export interface SetupChatState {
  readonly size: ChatSize;
}

/**
 * The zone's width in canvas pixels: the side columns of 400 and 440, two gaps and the frame's
 * padding of 24 each, and the chat's own width. `.goal-grid` in global.css owns these sizes.
 */
export function goalZoneWidth(chat: SetupChatState): number {
  return 960 + chat.size.width;
}

/** The chat's state of this page: the size the browser keeps. */
export function useSetupChat(): [SetupChatState, (next: SetupChatState) => void] {
  const [chat, setChat] = useState<SetupChatState>(() => ({ size: storedChatSize() }));
  const change = useCallback((next: SetupChatState) => {
    rememberChatSize(next.size);
    setChat(next);
  }, []);
  return [chat, change];
}

/** «Развернуть» or «Свернуть»: the largest size, or back to the default one from it. */
export function toggledChatSize(size: ChatSize): ChatSize {
  return isLargest(size) ? defaultChatSize : largestChatSize;
}

export type { ChatSize } from "./chat-size";
