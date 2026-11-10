// The size of the setup chat on the canvas, in canvas pixels. The Candidate drags its corner; the
// browser keeps the size, so the chat opens as the Candidate left it.

export interface ChatSize {
  readonly width: number;
  readonly height: number;
}

export const defaultChatSize: ChatSize = { width: 800, height: 820 };
/** The limits of the drag: a chat narrower or shorter than the least loses its message box. */
export const leastChatSize: ChatSize = { width: 560, height: 520 };
export const largestChatSize: ChatSize = { width: 1400, height: 1400 };

const key = "interview-sensei:setup-chat-size";

const within = (value: number, least: number, largest: number) =>
  Math.min(Math.max(Math.round(value), least), largest);

/** The size inside the limits. */
export function limitedChatSize({ width, height }: ChatSize): ChatSize {
  return {
    width: within(width, leastChatSize.width, largestChatSize.width),
    height: within(height, leastChatSize.height, largestChatSize.height),
  };
}

/** The size the Candidate left in this browser, or the default one. */
export function storedChatSize(): ChatSize {
  try {
    const stored: unknown = JSON.parse(globalThis.localStorage.getItem(key) ?? "null");
    if (
      typeof stored === "object" &&
      stored !== null &&
      "width" in stored &&
      typeof stored.width === "number" &&
      "height" in stored &&
      typeof stored.height === "number"
    ) {
      return limitedChatSize({ width: stored.width, height: stored.height });
    }
  } catch {
    // A broken stored value gives the default size.
  }
  return defaultChatSize;
}

export function rememberChatSize(size: ChatSize): void {
  globalThis.localStorage.setItem(key, JSON.stringify(size));
}

/** Whether the chat is at its largest size, so «Развернуть» becomes «Свернуть». */
export function isLargest(size: ChatSize): boolean {
  return size.width === largestChatSize.width && size.height === largestChatSize.height;
}
