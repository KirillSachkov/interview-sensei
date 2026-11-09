import { useEffect, useState } from "react";

import { interviewEventsUrl, interviewMessage } from "@/shared/api";
import type { InterviewView } from "@/shared/api";

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

/**
 * Follows one Mock interview over its WebSocket: the server sends the whole view at once and after
 * each change. `lost` turns true when the socket closes without the page closing it.
 */
export function useInterviewEvents(initial: InterviewView) {
  const [view, setView] = useState(initial);
  const [lost, setLost] = useState(false);
  const { id } = initial;
  useEffect(() => {
    const connection = new WebSocket(interviewEventsUrl(id));
    let closedByPage = false;
    connection.addEventListener("message", (event) => {
      const next = interviewMessage(event.data);
      if (next !== null) {
        setView(next);
      }
    });
    const lose = () => {
      if (!closedByPage) {
        setLost(true);
      }
    };
    connection.addEventListener("close", lose);
    connection.addEventListener("error", lose);
    return () => {
      closedByPage = true;
      closeSocket(connection);
    };
  }, [id]);
  return { view, lost };
}
