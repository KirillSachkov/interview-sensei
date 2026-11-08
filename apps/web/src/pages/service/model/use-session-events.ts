import { useCallback, useEffect, useRef, useState } from "react";

import { isSessionView, sessionEventsUrl } from "@/shared/api";
import type { SessionView } from "@/shared/api";

/** What the server sends over the session's WebSocket. */
type ServerMessage =
  | { type: "session"; session: SessionView }
  | { type: "prompt_rejected"; reason: string }
  | { type: "invalid_command" };

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function serverMessage(data: unknown): ServerMessage | null {
  const message = typeof data === "string" ? parseJson(data) : undefined;
  if (typeof message !== "object" || message === null || !("type" in message)) {
    return null;
  }
  if (message.type === "session" && "session" in message && isSessionView(message.session)) {
    return { type: "session", session: message.session };
  }
  if (message.type === "prompt_rejected" && "reason" in message) {
    return { type: "prompt_rejected", reason: String(message.reason) };
  }
  return message.type === "invalid_command" ? { type: "invalid_command" } : null;
}

function rejectionText(reason: string): string {
  switch (reason) {
    case "busy": {
      return "Агент ещё занят. Дождитесь ответа и отправьте сообщение снова.";
    }
    case "closed": {
      return "Чат больше не принимает сообщения. Начните новый чат.";
    }
    case "not_found": {
      return "Чат не найден. Начните новый чат.";
    }
    default: {
      return `Сервер не принял сообщение: ${reason}.`;
    }
  }
}

/** Why the page does not follow the session: the socket closed or failed. */
function lostText(event: CloseEvent | Event): string {
  return event instanceof CloseEvent && event.code === 4404
    ? "Чат не найден на сервере."
    : "Соединение с сервером потеряно.";
}

/** Closes the socket; during the handshake it waits for the open, which the dev proxy needs. */
function closeSocket(connection: WebSocket): void {
  if (connection.readyState === WebSocket.CONNECTING) {
    connection.addEventListener("open", () => {
      connection.close();
    });
  } else {
    connection.close();
  }
}

interface SocketHandlers {
  readonly onView: (view: SessionView) => void;
  readonly onNotice: (text: string) => void;
  readonly onLost: (text: string) => void;
}

/** Passes the socket's messages and its loss to the handlers; returns the page's own close. */
function follow(connection: WebSocket, { onView, onNotice, onLost }: SocketHandlers) {
  let closedByPage = false;
  connection.addEventListener("message", (event) => {
    const message = serverMessage(event.data);
    if (message?.type === "session") {
      onView(message.session);
    } else if (message?.type === "prompt_rejected") {
      onNotice(rejectionText(message.reason));
    } else if (message?.type === "invalid_command") {
      onNotice("Сервер не понял команду. Обновите страницу.");
    }
  });
  const lose = (event: CloseEvent | Event) => {
    if (!closedByPage) {
      onLost(lostText(event));
    }
  };
  connection.addEventListener("close", lose);
  connection.addEventListener("error", lose);
  return () => {
    closedByPage = true;
    closeSocket(connection);
  };
}

/**
 * Follows one session over its WebSocket: the server sends the whole view at once and after each
 * change. `prompt` and `cancel` go to the server over the same socket. `notice` explains a
 * refused message; `lost` says why the socket closed. To connect again, mount the hook anew.
 */
export function useSessionEvents(sessionId: string) {
  const [view, setView] = useState<SessionView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [lost, setLost] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    const connection = new WebSocket(sessionEventsUrl(sessionId));
    socket.current = connection;
    const close = follow(connection, { onView: setView, onNotice: setNotice, onLost: setLost });
    return () => {
      socket.current = null;
      close();
    };
  }, [sessionId]);

  const send = useCallback((command: object) => {
    socket.current?.send(JSON.stringify(command));
  }, []);
  const prompt = useCallback(
    (text: string) => {
      setNotice(null);
      send({ type: "prompt", text });
    },
    [send],
  );
  const cancel = useCallback(() => {
    send({ type: "cancel" });
  }, [send]);

  // A view of the previous session stays in state until the new socket sends its first view.
  return { view: view?.id === sessionId ? view : null, notice, lost, prompt, cancel };
}
