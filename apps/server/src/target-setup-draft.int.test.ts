// Spec #45, seam 1, ticket #49: the draft of changes outlives the setup session and a restart,
// loses one change by ✕ or all of them by «Отменить изменения», and an invalid draft changes
// nothing. The fake agent's `/tool <name> <json>` stands for the agent's calls of our MCP tools.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  api,
  applyDraft,
  callTool,
  draftOf,
  openSetup,
  setupChat,
  targetOf,
  toolResult,
} from "./setup-test-support.ts";

const named = { name: "Go-разработчик", level: "middle" };
const plan = { sections: [{ name: "Go", kind: "topics", topics: ["Горутины"] }] };

/** A new draft Target whose agent recorded `named` and `plan`, and its draft. */
async function recordedDraft(server: FastifyInstance) {
  const chat = await setupChat(server);
  await callTool(chat.events, "update_target", named);
  await callTool(chat.events, "set_interview_plan", plan);
  return { ...chat, recorded: await draftOf(server, chat.target.id) };
}

async function endSetup(server: FastifyInstance, targetId: string) {
  return api(server).post(`/api/targets/${targetId}/setup-session/end`);
}

describe("draft of changes over time", () => {
  it("keeps the draft after «Завершить», and the next session's agent sees it", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, recorded } = await recordedDraft(server);

    const ended = await endSetup(server, target.id);

    expect(ended.statusCode).toBe(204);
    await expect(draftOf(server, target.id)).resolves.toStrictEqual(recorded);
    const next = await openSetup(server, target.id);
    const brief = await callTool(next.events, "get_brief");
    expect(brief).toContain("The draft of changes, 2 not applied");
    expect(brief).toContain(recorded[1]?.id);
  });

  it("keeps the draft after a restart of the server", async () => {
    const dataDirectory = await temporaryDirectory();
    const first = await startServer(dataDirectory);
    const { target, recorded } = await recordedDraft(first.server);

    await first.stop();

    const { server } = await startServer(dataDirectory);
    await expect(draftOf(server, target.id)).resolves.toStrictEqual(recorded);
    await expect(targetOf(server, target.id)).resolves.toMatchObject({ name: "", sections: [] });
  });

  it("starts a new setup session after «Завершить»", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, session } = await setupChat(server);

    await endSetup(server, target.id);

    const reopened = await api(server).post(`/api/targets/${target.id}/setup-session`);
    expect(reopened.statusCode).toBe(201);
    expect(reopened.json<{ id: string }>().id).not.toBe(session.id);
  });

  it("refuses to end the setup session of an unknown Target", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const response = await endSetup(server, crypto.randomUUID());

    expect(response.statusCode).toBe(404);
  });
});

describe("removing changes from the draft", () => {
  it("removes one change by ✕ and another by the agent's remove_draft_change", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await recordedDraft(server);
    await callTool(events, "update_target", { tone: "strict" });
    const [byCross, byAgent, kept] = await draftOf(server, target.id);

    const removed = await api(server).delete(
      `/api/targets/${target.id}/draft/changes/${byCross?.id}`,
    );
    const reply = await callTool(events, "remove_draft_change", { id: byAgent?.id });

    expect(removed.statusCode).toBe(204);
    expect(reply).toMatch(/^Результат remove_draft_change: /u);
    await expect(toolResult(events, "get_draft")).resolves.toStrictEqual({ changes: [kept] });
  });

  it("refuses to remove a change of another Target's draft", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const own = await setupChat(server);
    const other = await recordedDraft(server);
    const foreign = other.recorded[0]?.id;

    const removed = await api(server).delete(
      `/api/targets/${own.target.id}/draft/changes/${foreign}`,
    );
    const reply = await callTool(own.events, "remove_draft_change", { id: foreign });

    expect(removed.statusCode).toBe(404);
    expect(removed.json()).toStrictEqual({ error: "change_not_found" });
    expect(reply).toMatch(/^Ошибка remove_draft_change: /u);
    await expect(draftOf(server, other.target.id)).resolves.toStrictEqual(other.recorded);
  });

  it("clears the draft by «Отменить изменения», and the Target stays as it was", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target } = await recordedDraft(server);

    const discarded = await api(server).delete(`/api/targets/${target.id}/draft`);

    expect(discarded.statusCode).toBe(204);
    await expect(draftOf(server, target.id)).resolves.toStrictEqual([]);
    await expect(targetOf(server, target.id)).resolves.toMatchObject({ name: "", sections: [] });
  });

  it("clears the draft by the agent's discard_draft", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await recordedDraft(server);

    const reply = await toolResult(events, "discard_draft");

    expect(reply).toStrictEqual({ discarded: 2 });
    await expect(draftOf(server, target.id)).resolves.toStrictEqual([]);
  });
});

const quiz = {
  topic: "Горутины",
  text: "Сколько памяти берёт горутина на старте?",
  format: "quiz",
  options: [
    { id: "a", text: "2 КБ" },
    { id: "b", text: "1 МБ" },
  ],
  correctOptionIds: [],
};
const quizProblem = `У квиза «${quiz.text}» нет верного ответа.`;

describe("invalid draft", () => {
  it("is not applied by «Применить»: the Target stays unchanged, and the Candidate gets the problems", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await recordedDraft(server);
    await callTool(events, "add_questions", { questions: [quiz] });

    const applied = await applyDraft(server, target.id);

    expect(applied.statusCode).toBe(409);
    expect(applied.json()).toStrictEqual({ error: "draft_invalid", problems: [quizProblem] });
    await expect(targetOf(server, target.id)).resolves.toMatchObject({
      name: "",
      status: "draft",
      sections: [],
    });
    await expect(draftOf(server, target.id)).resolves.toHaveLength(3);
  });

  it("is not applied by apply_changes: the agent gets the problems", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target, events } = await recordedDraft(server);
    await callTool(events, "add_questions", { questions: [quiz] });

    const reply = await callTool(events, "apply_changes");

    expect(reply).toBe(`Ошибка apply_changes: ${quizProblem}`);
    await expect(targetOf(server, target.id)).resolves.toMatchObject({ name: "", sections: [] });
  });
});
