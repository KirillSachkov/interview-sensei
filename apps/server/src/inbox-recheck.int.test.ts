// Seam 1 of spec #47: the recheck of the bank after a new Preference. The setup agent proposes it
// with a card, only the Candidate's button starts it, the recheck changes nothing itself and writes
// the list «скрыть?» with reasons, and the Candidate accepts it with a bulk action. A Preference
// with `[manual]` stops the fake processor at «Жду команд.», so `/tool` drives it.
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { browserHeaders, startServer, temporaryDirectory } from "./chat-test-support.ts";
import {
  attach,
  inboxOf,
  latestReportId,
  processingEvents,
  processingSession,
  sectionOf,
  sessionEnded,
  startProcessing,
  topicOf,
} from "./inbox-test-support.ts";
import {
  api,
  applied,
  appliedTarget,
  callTool,
  questionsOf,
  toolResult,
} from "./setup-test-support.ts";

const preference = "Меньше вопросов про Kafka";

async function startRecheck(server: FastifyInstance, targetId: string) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/inbox/recheck`,
    headers: browserHeaders(server),
  });
}

/** The recheck report with its list «скрыть?», as the panel reads it. */
interface RecheckReport {
  readonly mode: string;
  readonly toHide: readonly {
    readonly questionId: string;
    readonly text: string;
    readonly reason: string;
    readonly hidden: boolean;
  }[];
}

async function recheckReport(server: FastifyInstance, targetId: string, reportId: string) {
  const response = await api(server).get(`/api/targets/${targetId}/inbox-reports/${reportId}`);
  return response.json<RecheckReport>();
}

/** An active Target with the setup plan and Questions, and an applied Preference. */
async function targetWithPreference(text = preference) {
  const { server } = await startServer(await temporaryDirectory());
  const { target, events } = await appliedTarget(server);
  await applied({ server, events, targetId: target.id }, ["save_preference", { text }]);
  return { server, target, setup: events };
}

/** The open recheck proposal of the Target, null without one. */
async function recheckProposalOf(server: FastifyInstance, targetId: string) {
  const state = await inboxOf(server, targetId);
  return state.recheckProposal;
}

/** «Не сейчас» on the card «Перепроверка базы». */
async function dismissRecheck(server: FastifyInstance, targetId: string) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/inbox/recheck-proposal/dismiss`,
    headers: browserHeaders(server),
  });
}

/** The bulk action «скрыть» of the Questions, as the report panel sends it. */
async function hideQuestions(server: FastifyInstance, targetId: string, ids: readonly string[]) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/questions/review`,
    headers: browserHeaders(server),
    payload: { action: "hide", questionIds: ids },
  });
}

/** The proposed recheck started by its button; resolves with its report once the agent ends. */
async function finishedRecheck(server: FastifyInstance, targetId: string) {
  const started = await startRecheck(server, targetId);
  expect(started.statusCode).toBe(202);
  const reportId = await latestReportId(server, targetId);
  await sessionEnded(server, await processingSession(server, targetId));
  return { reportId, report: await recheckReport(server, targetId, reportId) };
}

/** A recheck whose fake agent waits for `/tool` commands. */
async function manualRecheck() {
  const { server, target } = await targetWithPreference(`${preference} [manual]`);
  const started = await startRecheck(server, target.id);
  expect(started.statusCode).toBe(202);
  const { events } = await processingEvents(server, target.id);
  return { server, target, events };
}

const madeUp = (topicId: string) => ({
  topicId,
  text: "Что такое горутина?",
  level: "middle",
  sectionKind: "topics",
});

describe("the recheck of the bank", () => {
  it("propose_recheck shows the card in the setup chat, and nothing starts without the button", async () => {
    const { server, target, setup } = await targetWithPreference();

    await toolResult(setup, "propose_recheck", { reason: `Новое пожелание: «${preference}».` });

    const state = await inboxOf(server, target.id);
    expect(state.recheckProposal).toMatchObject({ reason: `Новое пожелание: «${preference}».` });
    expect(state.run).toBeNull();
  });

  it("«Не сейчас» closes the card of the recheck", async () => {
    const { server, target, setup } = await targetWithPreference();
    await toolResult(setup, "propose_recheck", { reason: "Новое пожелание." });

    const dismissed = await dismissRecheck(server, target.id);

    expect(dismissed.statusCode).toBe(204);
    await expect(recheckProposalOf(server, target.id)).resolves.toBeNull();
  });

  it("changes nothing itself and lists «скрыть?» with reasons that name the Preference", async () => {
    const { server, target, setup } = await targetWithPreference();
    await toolResult(setup, "propose_recheck", { reason: "Новое пожелание." });
    const before = await questionsOf(server, target.id);

    const { report } = await finishedRecheck(server, target.id);

    await expect(recheckProposalOf(server, target.id)).resolves.toBeNull();
    expect(report.mode).toBe("recheck");
    expect(
      report.toHide.map(({ questionId, text, hidden }) => ({ questionId, text, hidden })),
    ).toStrictEqual(before.map(({ id, text }) => ({ questionId: id, text, hidden: false })));
    expect(report.toHide.filter(({ reason }) => !reason.includes(preference))).toStrictEqual([]);
    await expect(questionsOf(server, target.id)).resolves.toStrictEqual(before);
  });

  it("the Candidate accepts the list «скрыть?» with a bulk action", async () => {
    const { server, target } = await targetWithPreference();
    const { reportId, report } = await finishedRecheck(server, target.id);

    await hideQuestions(
      server,
      target.id,
      report.toHide.map(({ questionId }) => questionId),
    );

    await expect(questionsOf(server, target.id)).resolves.toStrictEqual([]);
    const accepted = await recheckReport(server, target.id, reportId);
    expect(accepted.toHide.map(({ hidden }) => hidden)).toStrictEqual(
      report.toHide.map(() => true),
    );
  });

  it("the recheck agent cannot add Questions or Topics, and a processing waits until it ends", async () => {
    const { server, target, events } = await manualRecheck();
    const file = await attach(server, { targetId: target.id, name: "vacancy.md", body: "Go" });

    const addedReply = await callTool(events, "add_bank_questions", {
      questions: [madeUp(topicOf(target, "Go"))],
    });
    const topicReply = await callTool(events, "create_topic", {
      sectionId: sectionOf(target, "Go").id,
      name: "Планировщик",
    });
    const processing = await startProcessing(server, target.id, [file.id]);

    const refusal = "A recheck changes nothing: list the Questions to hide in write_inbox_report";
    expect(addedReply).toBe(`Ошибка add_bank_questions: ${refusal}`);
    expect(topicReply).toBe(`Ошибка create_topic: ${refusal}`);
    expect(processing.statusCode).toBe(409);
  });

  it("refuses a Question of another Target in the list «скрыть?»", async () => {
    const { events } = await manualRecheck();

    const reply = await callTool(events, "write_inbox_report", {
      summary: "Перепроверка.",
      proposals: { hide: [{ questionId: crypto.randomUUID(), reason: "Не по пожеланию" }] },
    });

    expect(reply).toMatch(
      /^Ошибка write_inbox_report: The Question .+ is not a Question of this Target$/u,
    );
  });

  it("refuses a recheck of a Target without Questions", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const created = await api(server).post("/api/targets");
    const target = created.json<{ id: string }>();

    const response = await startRecheck(server, target.id);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "no_questions" });
  });
});

/** A processing of a one-part vacancy, finished; resolves with its report's id. */
async function processedOnce(server: FastifyInstance, targetId: string) {
  await attach(server, { targetId, name: "vacancy.txt", body: "Что такое select?" });
  await startProcessing(server, targetId);
  const reportId = await latestReportId(server, targetId);
  await sessionEnded(server, await processingSession(server, targetId));
  return reportId;
}

describe("the history of Inbox reports", () => {
  it("lists the Target's reports, the newest first, with their mode and what they added", async () => {
    const { server, target } = await targetWithPreference();
    const processed = await processedOnce(server, target.id);
    await startRecheck(server, target.id);
    const rechecked = await waitForAnotherReport(server, target.id, processed);

    const response = await api(server).get(`/api/targets/${target.id}/inbox-reports`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([
      { id: rechecked, mode: "recheck", added: 0, toHide: 4, partial: false },
      { id: processed, mode: "processing", added: 1, toHide: 0, partial: false },
    ]);
  });
});

/** The id of the Target's latest report once it is not `previous`. */
async function waitForAnotherReport(server: FastifyInstance, targetId: string, previous: string) {
  return vi.waitFor(
    async () => {
      const id = await latestReportId(server, targetId);
      expect(id).not.toBe(previous);
      return id;
    },
    { timeout: 15_000, interval: 100 },
  );
}
