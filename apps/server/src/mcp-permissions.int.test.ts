// The session's own MCP address and the agent's permission requests through the server's HTTP and
// WebSocket API, with real PGlite and the fake ACP agent as a separate process.
import { describe, expect, it } from "vitest";

import {
  agentTexts,
  isIdle,
  readyChat,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";

const briefReply = "Фейковый агент прочитал brief:";

const lastAgentText = (view: SessionView) => agentTexts(view).at(-1) ?? "";
const isBriefRead = (view: SessionView) =>
  isIdle(view) && lastAgentText(view).startsWith(briefReply);
const permissionRequests = (view: SessionView) =>
  view.entries.filter((entry) => entry.type === "permission_request");

describe("mcp and permissions", () => {
  it("lets the agent call get_brief on the session's MCP address without asking the Candidate", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "prompt", text: "/brief" });

    const answered = await events.waitFor(isBriefRead);
    expect(lastAgentText(answered)).toContain("Interview Sensei service chat");
    expect(events.views.flatMap((view) => permissionRequests(view))).toStrictEqual([]);
  });
});
