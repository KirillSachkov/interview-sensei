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
const hasAnswered = (reply: string) => (view: SessionView) =>
  isIdle(view) && lastAgentText(view) === reply;
const isStopped = (view: SessionView) =>
  isIdle(view) && view.entries.some((entry) => entry.type === "turn_interrupted");
const isAskingPermission = (view: SessionView) =>
  permissionRequests(view).some((entry) => entry.answer === null);

describe("mcp and permissions", () => {
  it("lets the agent call get_brief on the session's MCP address without asking the Candidate", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "prompt", text: "/brief" });

    const answered = await events.waitFor(isBriefRead);
    expect(lastAgentText(answered)).toContain("Interview Sensei service chat");
    expect(events.views.flatMap((view) => permissionRequests(view))).toStrictEqual([]);
  });

  it("passes a foreign tool's permission request to the browser and the Candidate's answer to the agent", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "prompt", text: "/permission" });

    const asking = await events.waitFor(isAskingPermission);
    const [request] = permissionRequests(asking);
    // The title names our MCP server and tool, but only structural fields mark our tools.
    expect(request).toMatchObject({
      title: "mcp__interview-sensei__get_brief: touch interview-sensei/get_brief.txt",
      options: [
        { optionId: "allow-once", name: "Разрешить", kind: "allow_once" },
        { optionId: "allow-always", name: "Разрешать всегда", kind: "allow_always" },
        { optionId: "reject-once", name: "Отклонить", kind: "reject_once" },
      ],
      answer: null,
    });
    expect(asking.status).toBe("working");
    events.send({ type: "permission", requestId: request?.requestId, optionId: "reject-once" });

    const answered = await events.waitFor(hasAnswered("Фейковый агент получил ответ: «Отклонить»"));
    expect(permissionRequests(answered)).toMatchObject([
      { answer: { outcome: "selected", optionId: "reject-once" } },
    ]);
  });

  it("answers a waiting permission request with cancelled when the Candidate stops the turn", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);
    events.send({ type: "prompt", text: "/permission" });
    await events.waitFor(isAskingPermission);

    events.send({ type: "cancel" });

    const stopped = await events.waitFor(isStopped);
    expect(permissionRequests(stopped)).toMatchObject([{ answer: { outcome: "cancelled" } }]);
  });

  it("refuses an answer to a request that no longer waits", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { events } = await readyChat(server);

    events.send({ type: "permission", requestId: "unknown", optionId: "allow-once" });

    await expect(events.nextReply()).resolves.toStrictEqual({
      type: "permission_rejected",
      reason: "not_found",
    });
  });
});
