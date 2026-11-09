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

describe("the recheck of the bank", () => {
  it("propose_recheck shows the card in the setup chat, and nothing starts without the button", async () => {
    const { server, target, setup } = await targetWithPreference();

    await toolResult(setup, "propose_recheck", { reason: `Новое пожелание: «${preference}».` });

    const state = await inboxOf(server, target.id);
    expect(state.recheckProposal).toMatchObject({ reason: `Новое пожелание: «${preference}».` });
    expect(state.run).toBeNull();
    const dismissed = await server.inject({
      method: "POST",
      url: `/api/targets/${target.id}/inbox/recheck-proposal/dismiss`,
      headers: browserHeaders(server),
    });
    expect(dismissed.statusCode).toBe(204);
    expect((await inboxOf(server, target.id)).recheckProposal).toBeNull();
  });

  it("changes nothing itself and lists «скрыть?» with reasons, which the Candidate accepts with a bulk action", async () => {
    const { server, target, setup } = await targetWithPreference();
    await toolResult(setup, "propose_recheck", { reason: "Новое пожелание." });
    const before = await questionsOf(server, target.id);

    const started = await startRecheck(server, target.id);

    expect(started.statusCode).toBe(202);
    expect((await inboxOf(server, target.id)).recheckProposal).toBeNull();
    const reportId = await latestReportId(server, target.id);
    await sessionEnded(server, await processingSession(server, target.id));
    const report = await recheckReport(server, target.id, reportId);
    expect(report.mode).toBe("recheck");
    expect(report.toHide.map(({ text }) => text)).toStrictEqual(before.map(({ text }) => text));
    expect(
      report.toHide.every(({ reason, hidden }) => reason.includes(preference) && !hidden),
    ).toBe(true);
    expect(await questionsOf(server, target.id)).toStrictEqual(before);

    await server.inject({
      method: "POST",
      url: `/api/targets/${target.id}/questions/review`,
      headers: browserHeaders(server),
      payload: { action: "hide", questionIds: report.toHide.map(({ questionId }) => questionId) },
    });

    expect(await questionsOf(server, target.id)).toStrictEqual([]);
    const accepted = await recheckReport(server, target.id, reportId);
    expect(accepted.toHide.every(({ hidden }) => hidden)).toBe(true);
  });

  it("the recheck agent cannot add Questions or Topics, and a processing waits until it ends", async () => {
    const { server, target } = await targetWithPreference(`${preference} [manual]`);
    expect((await startRecheck(server, target.id)).statusCode).toBe(202);
    const { events } = await processingEvents(server, target.id);
    const file = await attach(server, { targetId: target.id, name: "vacancy.md", body: "Go" });

    const addedReply = await callTool(events, "add_bank_questions", {
      questions: [
        {
          topicId: topicOf(target, "Go"),
          text: "Что такое горутина?",
          level: "middle",
          sectionKind: "topics",
        },
      ],
    });
    const topicReply = await callTool(events, "create_topic", {
      sectionId: target.sections[1]?.id,
      name: "Планировщик",
    });
    const processing = await startProcessing(server, target.id, [file.id]);

    const refusal = "A recheck changes nothing: list the Questions to hide in write_inbox_report";
    expect(addedReply).toBe(`Ошибка add_bank_questions: ${refusal}`);
    expect(topicReply).toBe(`Ошибка create_topic: ${refusal}`);
    expect(processing.statusCode).toBe(409);
  });

  it("refuses a Question of another Target in the list «скрыть?»", async () => {
    const { server, target } = await targetWithPreference(`${preference} [manual]`);
    await startRecheck(server, target.id);
    const { events } = await processingEvents(server, target.id);

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

describe("the history of Inbox reports", () => {
  it("lists the Target's reports, the newest first, with their mode and what they added", async () => {
    const { server, target, setup } = await targetWithPreference();
    await attach(server, { targetId: target.id, name: "vacancy.txt", body: "Что такое select?" });
    await startProcessing(server, target.id);
    const processed = await latestReportId(server, target.id);
    await sessionEnded(server, await processingSession(server, target.id));
    await toolResult(setup, "propose_recheck", { reason: "Новое пожелание." });
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
