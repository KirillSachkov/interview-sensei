import { useCallback, useEffect, useRef, useState } from "react";

import { isSessionView, sessionEventsUrl } from "@/shared/api";
import type { SessionView } from "@/shared/api";

function sessionIn(data: unknown): SessionView | null {
  const message: unknown = typeof data === "string" ? JSON.parse(data) : null;
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "session" &&
    "session" in message &&
    isSessionView(message.session)
  ) {
    return message.session;
  }
  return null;
}

/**
 * Follows one session over its WebSocket: the server sends the whole view at once and after each
 * change. `prompt` and `cancel` go to the server over the same socket.
 */
export function useSessionEvents(sessionId: string) {
  const [view, setView] = useState<SessionView | null>(null);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connection = new WebSocket(sessionEventsUrl(sessionId));
    socket.current = connection;
    connection.addEventListener("message", (event) => {
      const next = sessionIn(event.data);
      if (next !== null) {
        setView(next);
      }
    });
    return () => {
      socket.current = null;
      // Closing during the handshake breaks the dev proxy's pipe; close once the socket opens.
      if (connection.readyState === WebSocket.CONNECTING) {
        connection.addEventListener("open", () => {
          connection.close();
        });
      } else {
        connection.close();
      }
    };
  }, [sessionId]);

  const send = useCallback((command: object) => {
    socket.current?.send(JSON.stringify(command));
  }, []);
  const prompt = useCallback(
    (text: string) => {
      send({ type: "prompt", text });
    },
    [send],
  );
  const cancel = useCallback(() => {
    send({ type: "cancel" });
  }, [send]);

  // A view of the previous session stays in state until the new socket sends its first view.
  return { view: view?.id === sessionId ? view : null, prompt, cancel };
}
