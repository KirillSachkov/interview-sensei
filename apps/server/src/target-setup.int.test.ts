// Spec #45, seam 1, ticket #48: «Новая цель», the onboarding in the Target setup session, the
// draft of changes and its application, through the server's HTTP API with the fake ACP agent.
// The fake agent's `/tool <name> <json>` stands for the agent's calls of our MCP tools.
import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import {
  agentTexts,
  browserHeaders,
  isIdle,
  messages,
  openEvents,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";
import type { TargetView } from "./model-test-support.ts";

type Events = Awaited<ReturnType<typeof openEvents>>;

const lastAgentText = (view: SessionView) => agentTexts(view).at(-1) ?? "";

async function post(server: FastifyInstance, url: string) {
  return server.inject({ method: "POST", url, headers: browserHeaders(server) });
}

async function get(server: FastifyInstance, url: string) {
  return server.inject({ url, headers: browserHeaders(server) });
}

async function newTarget(server: FastifyInstance): Promise<TargetView> {
  const response = await post(server, "/api/targets");
  expect(response.statusCode).toBe(201);
  return response.json<TargetView>();
}

async function openSetup(server: FastifyInstance, targetId: string) {
  return post(server, `/api/targets/${targetId}/setup-session`);
}

/** The agent answered the onboarding prompt that the session started with. */
const onboarded = (view: SessionView) => isIdle(view) && agentTexts(view).length > 0;

/** A new draft Target with its setup session, once the agent has started the onboarding. */
async function setupChat(server: FastifyInstance) {
  const created = await newTarget(server);
  const opened = await openSetup(server, created.id);
  expect(opened.statusCode).toBe(201);
  const session = opened.json<SessionView & { kind: string; targetId: string }>();
  const events = await openEvents(server, session.id);
  const first = await events.waitFor(onboarded);
  return { target: created, session, events, first };
}

/** Sends `/tool <name> <json>` and resolves with the fake agent's reply to it. */
async function callTool(events: Events, name: string, args: object = {}): Promise<string> {
  const before = agentTexts(
    events.views.at(-1) ?? { id: "", status: "", entries: [], failure: null },
  );
  events.send({ type: "prompt", text: `/tool ${name} ${JSON.stringify(args)}` });
  const answered = await events.waitFor(
    (view) =>
      isIdle(view) &&
      agentTexts(view).length > before.length &&
      /^(?:Результат|Ошибка) /u.test(lastAgentText(view)),
  );
  return lastAgentText(answered);
}

async function targetOf(server: FastifyInstance, id: string): Promise<TargetView> {
  const response = await get(server, `/api/targets/${id}`);
  return response.json<TargetView>();
}

async function draft(server: FastifyInstance, id: string) {
  const response = await get(server, `/api/targets/${id}/draft`);
  return response.json<{ changes: { id: string; operation: object }[] }>();
}

/** Records the plan by the agent's tool and applies the draft by «Применить». */
async function applyPlan(
  { server, events, targetId }: { server: FastifyInstance; events: Events; targetId: string },
  sections: object,
): Promise<TargetView> {
  await callTool(events, "set_interview_plan", sections);
  const response = await post(server, `/api/targets/${targetId}/draft/apply`);
  expect(response.statusCode).toBe(200);
  return response.json<TargetView>();
}

const named = { name: "Go-разработчик в финтех", level: "middle" };
const plan = {
  sections: [
    {
      name: "Опыт и резюме",
      kind: "conversation",
      gradingCriteria: "Конкретика и роль кандидата",
      topics: [],
    },
    {
      name: "Go и конкурентность",
      kind: "topics",
      gradingCriteria: "Понимает модель памяти",
      topics: ["Горутины", "Каналы"],
    },
    { name: "Проектирование", kind: "design", gradingCriteria: "", topics: ["Kafka"] },
  ],
};

/** The plan as the Candidate sees it: Sections with their kind and Topic names. */
function planOf(view: TargetView) {
  return view.sections.map((section) => ({
    name: section.name,
    kind: section.kind,
    enabled: section.enabled,
    topics: section.topics.map((topic) => topic.name),
  }));
}

const expectedPlan = [
  { name: "Опыт и резюме", kind: "conversation", enabled: true, topics: [] },
  { name: "Go и конкурентность", kind: "topics", enabled: true, topics: ["Горутины", "Каналы"] },
  { name: "Проектирование", kind: "design", enabled: true, topics: ["Kafka"] },
];

describe("new Target and onboarding", () => {
  it("creates an empty draft Target for «Новая цель»", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const created = await newTarget(server);

    expect(created).toMatchObject({ name: "", status: "draft", level: null, sections: [] });
    const list = await get(server, "/api/targets");
    expect(list.json()).toStrictEqual([{ id: created.id, name: "", status: "draft", level: null }]);
  });

  it("starts the onboarding of a draft Target in its setup session without a Candidate message", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const { target: created, session, events, first } = await setupChat(server);

    expect(session).toMatchObject({ kind: "target-setup", targetId: created.id, agent: "fake" });
    expect(messages(first).map((entry) => entry.type)).toStrictEqual(["agent_message"]);
    expect(lastAgentText(first)).toContain("Начни настройку новой цели");
    await expect(callTool(events, "get_brief")).resolves.toMatch(
      /^Результат get_brief: .*Mode: onboarding/su,
    );
  });

  it("returns the running setup session when the Candidate opens the setup again", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target: created, session } = await setupChat(server);

    const reopened = await openSetup(server, created.id);

    expect(reopened.statusCode).toBe(200);
    expect(reopened.json()).toMatchObject({ id: session.id, kind: "target-setup" });
  });

  it("starts one setup session when the Candidate opens the setup twice at once", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const created = await newTarget(server);

    const opened = await Promise.all([
      openSetup(server, created.id),
      openSetup(server, created.id),
    ]);

    expect(
      opened.map((response) => response.statusCode).toSorted((left, right) => left - right),
    ).toStrictEqual([200, 201]);
    const [first, second] = opened.map((response) => response.json<{ id: string }>().id);
    expect(first).toBe(second);
  });

  it("refuses a setup session of an unknown Target", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const response = await openSetup(server, crypto.randomUUID());

    expect(response.statusCode).toBe(404);
    expect(response.json()).toStrictEqual({ error: "target_not_found" });
  });

  it("starts a Target setup session only through its Target", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const response = await server.inject({
      method: "POST",
      url: "/api/sessions",
      headers: browserHeaders(server),
      payload: { kind: "target-setup", agent: "fake" },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("draft of changes", () => {
  it("keeps the agent's changes in the draft and the Target unchanged until they are applied", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target: created, events } = await setupChat(server);

    await expect(callTool(events, "update_target", named)).resolves.toMatch(
      /^Результат update_target: /u,
    );
    await expect(callTool(events, "set_interview_plan", plan)).resolves.toMatch(
      /^Результат set_interview_plan: /u,
    );

    const { changes } = await draft(server, created.id);
    expect(changes.map((change) => change.operation)).toStrictEqual([
      { type: "update_target", ...named },
      // The draft keeps the plan as the agent gave it: an omitted field is filled in on apply.
      { type: "set_interview_plan", sections: plan.sections },
    ]);
    await expect(targetOf(server, created.id)).resolves.toMatchObject({
      name: "",
      status: "draft",
      level: null,
      sections: [],
    });
  });

  it("writes the whole draft at once with apply_changes and makes the Target active", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target: created, events } = await setupChat(server);
    await callTool(events, "update_target", named);
    await callTool(events, "set_interview_plan", plan);

    await expect(callTool(events, "apply_changes")).resolves.toMatch(/^Результат apply_changes: /u);

    const applied = await targetOf(server, created.id);
    expect(applied).toMatchObject({ ...named, status: "active" });
    expect(planOf(applied)).toStrictEqual(expectedPlan);
    await expect(draft(server, created.id)).resolves.toStrictEqual({ changes: [] });
  });

  it("applies the draft by «Применить» without the agent", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target: created, events } = await setupChat(server);
    await callTool(events, "update_target", named);
    await callTool(events, "set_interview_plan", plan);

    const response = await post(server, `/api/targets/${created.id}/draft/apply`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ...named, status: "active" });
    expect(planOf(response.json<TargetView>())).toStrictEqual(expectedPlan);
    await expect(draft(server, created.id)).resolves.toStrictEqual({ changes: [] });
  });

  it("creates Topics by name and reuses a Topic of the same name", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target: created, events } = await setupChat(server);
    const before = await applyPlan({ server, events, targetId: created.id }, plan);
    const channels = before.sections[1]?.topics.find((topic) => topic.name === "Каналы");

    const after = await applyPlan(
      { server, events, targetId: created.id },
      { sections: [{ name: "Go", kind: "topics", topics: ["каналы ", "Контексты"] }] },
    );

    const [section] = after.sections;
    expect(section?.topics.map((topic) => topic.name)).toStrictEqual(["Каналы", "Контексты"]);
    expect(section?.topics[0]?.id).toBe(channels?.id);
  });

  it("refuses to apply an empty draft", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const created = await newTarget(server);

    const response = await post(server, `/api/targets/${created.id}/draft/apply`);

    expect(response.statusCode).toBe(409);
    expect(response.json()).toStrictEqual({ error: "draft_empty" });
  });

  it("refuses a plan with two Sections of the same name and leaves the draft as it was", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const { target: created, events } = await setupChat(server);

    const reply = await callTool(events, "set_interview_plan", {
      sections: [
        { name: "Go", kind: "topics" },
        { name: "go", kind: "design" },
      ],
    });

    expect(reply).toBe("Ошибка set_interview_plan: В плане несколько секций с названием «Go».");
    await expect(draft(server, created.id)).resolves.toStrictEqual({ changes: [] });
  });
});
