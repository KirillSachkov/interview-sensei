import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import {
  goalSetup,
  goalSetupPath,
  goalSetupTurn,
  goalSetupTurnPath,
  guestWorkspace,
  guestWorkspacePath,
} from "@sensei/contracts";
import {
  goalSetupStore,
  migrate,
  workspaceStore,
} from "../apps/server/src/adapters/storage.js";
import { makeApi } from "../apps/server/src/adapters/http.js";
import { goalSetups } from "../apps/server/src/modules/goals-and-scenarios/index.js";
import {
  goalSetupAgent,
  type GoalSetupModel,
} from "../apps/server/src/modules/agent-execution/index.js";
import { deferred } from "./deferred.js";

const origin = "https://example.test";
const model = vi.fn<GoalSetupModel>();
async function openSetup() {
  const response = await app.api.inject({
    method: "POST",
    url: guestWorkspacePath,
    headers: { origin },
  });
  const { workspaceId } = guestWorkspace.parse(response.json<unknown>());
  const headers = { origin, cookie: `guest=${response.cookies[0]?.value}` };
  const url = goalSetupPath(workspaceId);
  return {
    workspaceId,
    url,
    headers,
    read: async () => {
      const response = await app.api.inject({ method: "GET", url, headers });
      expect(response.statusCode).toBe(200);
      return goalSetup.parse(response.json<unknown>());
    },
    send: (revision: number, message: string, turnId: string = randomUUID()) =>
      app.api.inject({
        method: "PUT",
        url: goalSetupTurnPath(workspaceId, turnId),
        headers,
        payload: { revision, message },
      }),
  };
}
const setup = async () => {
  const db = await new PostgreSqlContainer("postgres:18.6-alpine3.24").start();
  const url = db.getConnectionUri();
  const pool = new Pool({ connectionString: url });
  await migrate(url);
  const store = workspaceStore(pool);
  const api = await makeApi(
    origin,
    store,
    goalSetups(goalSetupStore(pool)),
    goalSetupAgent(model),
  );
  return { db, pool, store, api, url };
};
let app: Awaited<ReturnType<typeof setup>>;
beforeAll(async () => {
  app = await setup();
}, 120000);
afterAll(async () => {
  if (app) {
    await app.api.close();
    await app.pool.end();
    await app.db.stop();
  }
});
it("restores only the cookie holder after migration and rejects foreign origins", async () => {
  const request = (source: string, cookie?: string) =>
    app.api.inject({
      method: "POST",
      url: guestWorkspacePath,
      headers: { origin: source, ...(cookie ? { cookie } : {}) },
    });
  expect((await request("https://other.test")).statusCode).toBe(403);
  const first = await request(origin);
  expect(first.statusCode).toBe(200);
  const { workspaceId } = guestWorkspace.parse(first.json<unknown>());
  const cookie = first.cookies[0];
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });
  expect(cookie?.maxAge).toBeGreaterThan(0);
  await migrate(app.url);
  expect(
    (await request(origin, `guest=${cookie?.value}`)).json<unknown>(),
  ).toEqual({ workspaceId });
  expect(
    guestWorkspace.parse(
      (await request(origin, `guest=${workspaceId}`)).json<unknown>(),
    ).workspaceId,
  ).not.toBe(workspaceId);
});
it("rolls back the workspace when writing its session fails", async () => {
  await app.store.create("duplicate");
  const count = async () =>
    (await app.pool.query<{ count: string }>("select count(*) from workspaces"))
      .rows;
  const before = await count();
  await expect(app.store.create("duplicate")).rejects.toThrow();
  expect(await count()).toEqual(before);
});

it("opens an empty goal setup only for the workspace in the guest session", async () => {
  const first = await openSetup();
  const second = await openSetup();
  expect(await first.read()).toEqual({
    draft: {
      revision: 0,
      details: { role: null, level: null, market: null },
      current: null,
    },
    history: [],
  });
  const denied = await app.api.inject({
    method: "GET",
    url: first.url,
    headers: second.headers,
  });
  expect(denied.statusCode).toBe(404);
  expect(
    (await app.api.inject({ method: "GET", url: first.url })).statusCode,
  ).toBe(404);
  model.mockReset().mockResolvedValueOnce({
    changes: { role: "Go-разработчик" },
    replyKind: "conversation",
    reply: "Какой уровень позиции рассматриваешь?",
  });
  const turnId = randomUUID();
  expect(
    (await first.send(0, "Хочу на Go-разработчика", turnId)).statusCode,
  ).toBe(200);
  const url = goalSetupTurnPath(first.workspaceId, turnId);
  const payload = { revision: 1, message: "В России" };
  expect(
    (await app.api.inject({ method: "GET", url, headers: second.headers }))
      .statusCode,
  ).toBe(404);
  expect(
    (
      await app.api.inject({
        method: "PUT",
        url,
        headers: second.headers,
        payload,
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await app.api.inject({
        method: "PUT",
        url: goalSetupTurnPath(first.workspaceId, randomUUID()),
        headers: {
          ...first.headers,
          origin: "https://other.test",
        },
        payload,
      })
    ).statusCode,
  ).toBe(403);
  expect(model).toHaveBeenCalledOnce();
  expect((await first.read()).draft.revision).toBe(1);
  expect((await second.read()).draft.revision).toBe(0);
});

it("shows the actual correction path and keeps known details apart from the dialogue", async () => {
  const { read, send } = await openSetup();
  const correction = {
    changes: { level: "senior" },
    replyKind: "proposal",
    reply:
      "Готовиться к собеседованиям на позицию Go-разработчика уровня senior на российском рынке.",
  };
  model
    .mockReset()
    .mockResolvedValueOnce({
      changes: { role: "Go-разработчик", level: "middle" },
      replyKind: "conversation",
      reply: "На каком рынке ищешь работу?",
    })
    .mockResolvedValueOnce({
      changes: { market: "Россия" },
      replyKind: "proposal",
      reply:
        "Готовиться к собеседованиям на позицию Go-разработчика уровня middle на российском рынке.",
    })
    .mockResolvedValueOnce(correction);
  const first = await send(0, "Хочу готовиться на middle Go");
  expect(first.statusCode).toBe(200);
  const firstTurn = goalSetupTurn.parse(first.json<unknown>());
  expect(firstTurn).toMatchObject({
    draft: {
      revision: 1,
      details: { role: "Go-разработчик", level: "middle", market: null },
      current: { kind: "question", text: "На каком рынке ищешь работу?" },
    },
    path: ["load_context", "interpret_message", "continue_conversation"],
  });
  const second = await send(1, "В России");
  expect(second.statusCode).toBe(200);
  const secondTurn = goalSetupTurn.parse(second.json<unknown>());
  expect(secondTurn).toMatchObject({
    draft: { current: { kind: "proposal", version: 1 } },
  });
  const third = await send(2, "Да, только senior");
  expect(third.statusCode).toBe(200);
  const result = goalSetupTurn.parse(third.json<unknown>());
  expect(result).toMatchObject({
    reply: correction.reply,
    path: ["load_context", "interpret_message", "show_proposal"],
    draft: {
      revision: 3,
      details: { role: "Go-разработчик", level: "senior", market: "Россия" },
      current: { kind: "proposal", version: 2 },
    },
  });
  expect(model).toHaveBeenCalledTimes(3);
  const input = model.mock.calls[2]?.[1];
  expect(input).toEqual({
    message: "Да, только senior",
    draft: secondTurn.draft,
    history: [
      {
        turnId: firstTurn.turnId,
        message: "Хочу готовиться на middle Go",
        reply: "На каком рынке ищешь работу?",
      },
      {
        turnId: secondTurn.turnId,
        message: "В России",
        reply:
          "Готовиться к собеседованиям на позицию Go-разработчика уровня middle на российском рынке.",
      },
    ],
  });
  await migrate(app.url);
  const setup = await read();
  expect(setup).toMatchObject({
    draft: { revision: 3, current: { version: 2 } },
    history: [
      { message: "Хочу готовиться на middle Go" },
      { message: "В России" },
      { message: "Да, только senior" },
    ],
  });
  if (process.env["SENSEI_TRACE_GOAL_SETUP"] === "1")
    console.info(
      JSON.stringify(
        { input, modelReply: correction, turn: result, setup },
        null,
        2,
      ),
    );
});

it("keeps an open proposal on an ambiguous reply and withdraws it when the market is retracted", async () => {
  const { read, send } = await openSetup();
  const replies = [
    {
      changes: { role: "Go-разработчик", level: "middle" },
      replyKind: "conversation",
      reply: "На каком рынке ищешь работу?",
    },
    {
      changes: {},
      replyKind: "conversation",
      reply:
        "Можем начать с рынков, где тебе удобно проходить собеседования. Какие рассматриваешь?",
    },
    {
      changes: { market: "Россия" },
      replyKind: "proposal",
      reply:
        "Готовиться к собеседованиям на позицию Go-разработчика уровня middle на российском рынке.",
    },
    {
      changes: { market: null },
      replyKind: "conversation",
      reply: "Хорошо, можешь вернуться к предложению позже.",
    },
    {
      changes: {},
      withdrawn: ["market"],
      replyKind: "conversation",
      reply: "Какой рынок хочешь рассмотреть вместо российского?",
    },
    {
      changes: { market: "Германия" },
      replyKind: "proposal",
      reply:
        "Готовиться к собеседованиям на позицию Go-разработчика уровня middle на рынке Германии.",
    },
  ];
  model.mockReset();
  for (const reply of replies) model.mockResolvedValueOnce(reply);

  expect(
    (await send(0, "Хочу готовиться на middle Go, живу в Москве")).statusCode,
  ).toBe(200);
  expect((await read()).draft).toMatchObject({
    details: { role: "Go-разработчик", level: "middle", market: null },
    current: { kind: "question" },
  });
  expect((await send(1, "С рынком ещё не определился")).statusCode).toBe(200);
  expect((await read()).draft.current).toEqual({
    kind: "question",
    text: replies[1]?.reply,
  });
  expect((await send(2, "В России")).statusCode).toBe(200);
  const proposal = (await read()).draft.current;
  expect(proposal).toMatchObject({ kind: "proposal", version: 1 });
  const ambiguous = await send(3, "Я подумаю");
  expect(ambiguous.statusCode).toBe(200);
  expect(goalSetupTurn.parse(ambiguous.json<unknown>())).toMatchObject({
    draft: { current: proposal },
    path: ["load_context", "interpret_message", "continue_conversation"],
  });
  expect(
    (await send(4, "Россию больше не рассматриваю, куда дальше — ещё не решил"))
      .statusCode,
  ).toBe(200);
  const withdrawn = await read();
  expect(withdrawn.draft).toMatchObject({
    details: { role: "Go-разработчик", level: "middle", market: null },
    current: { kind: "question", text: replies[4]?.reply },
  });
  expect(withdrawn.history[2]?.reply).toBe(replies[2]?.reply);
  expect((await send(5, "В Германии")).statusCode).toBe(200);
  expect((await read()).draft.current).toMatchObject({
    kind: "proposal",
    version: 2,
    text: replies[5]?.reply,
  });
});

it("returns the saved turn for concurrent and later repeats while accepting a new turn with the same words", async () => {
  const { workspaceId, headers, read, send } = await openSetup();
  const started = deferred<void>();
  const reply = deferred<unknown>();
  const question = {
    changes: {},
    replyKind: "conversation",
    reply: "На какую позицию хочешь готовиться?",
  };
  model
    .mockReset()
    .mockImplementationOnce(() => {
      started.resolve();
      return reply.promise;
    })
    .mockResolvedValueOnce(question);
  const id = "aaaa0000-0000-4000-8000-000000000000";
  const first = send(0, "Привет", id);
  await started.promise;
  const concurrent = send(0, "Привет", id.toUpperCase());
  reply.resolve(question);
  const results = await Promise.all([first, concurrent]);
  for (const response of results) expect(response.statusCode).toBe(200);
  const [accepted, repeated] = results.map((response) =>
    goalSetupTurn.parse(response.json<unknown>()),
  );
  expect(repeated).toEqual(accepted);
  expect(model).toHaveBeenCalledOnce();
  expect((await send(0, "Другой текст", id)).statusCode).toBe(409);
  expect((await send(1, "Привет")).statusCode).toBe(200);
  expect(model).toHaveBeenCalledTimes(2);
  const restarted = await makeApi(
    origin,
    app.store,
    goalSetups(goalSetupStore(app.pool)),
    goalSetupAgent(model),
  );
  const url = goalSetupTurnPath(workspaceId, id);
  try {
    const lost = await restarted.inject({ method: "GET", url, headers });
    expect(lost.statusCode).toBe(200);
    expect(goalSetupTurn.parse(lost.json<unknown>())).toEqual(accepted);
    const replayed = await restarted.inject({
      method: "PUT",
      url,
      headers,
      payload: { revision: 0, message: "Привет" },
    });
    expect(replayed.statusCode).toBe(200);
    expect(goalSetupTurn.parse(replayed.json<unknown>())).toEqual(accepted);
  } finally {
    await restarted.close();
  }
  expect(model).toHaveBeenCalledTimes(2);
  expect((await read()).history.map(({ message }) => message)).toEqual([
    "Привет",
    "Привет",
  ]);
});

it("rejects a late result and leaves the last draft intact after a model failure", async () => {
  const { read, send } = await openSetup();
  const started = deferred<void>();
  const lateReply = deferred<unknown>();
  const newer = {
    changes: { role: "Go-разработчик", level: "senior" },
    replyKind: "conversation",
    reply: "На какой рынок ориентируешься?",
  };
  model
    .mockReset()
    .mockImplementationOnce(() => {
      started.resolve();
      return lateReply.promise;
    })
    .mockResolvedValueOnce(newer)
    .mockResolvedValueOnce({
      changes: { market: "Россия" },
      replyKind: "proposal",
      reply: "",
    })
    .mockResolvedValueOnce({
      changes: { market: "Россия" },
      replyKind: "conversation",
      reply: "Уже выбрал город?",
    })
    .mockResolvedValueOnce({
      changes: { market: "Россия" },
      replyKind: "proposal",
      reply:
        "Готовиться к позиции Go-разработчика уровня senior на российском рынке.",
    });
  const late = send(0, "Хочу на middle Go");
  await started.promise;
  const saved = await send(0, "Хочу на senior Go");
  lateReply.resolve({
    changes: { role: "Go-разработчик", level: "middle" },
    replyKind: "conversation",
    reply: "Какой рынок?",
  });
  expect(saved.statusCode).toBe(200);
  expect((await late).statusCode).toBe(409);
  expect((await send(0, "Хочу на middle Go")).statusCode).toBe(409);
  const beforeFailure = await read();
  expect(beforeFailure).toMatchObject({
    draft: { revision: 1, details: { level: "senior" } },
    history: [{ message: "Хочу на senior Go", reply: newer.reply }],
  });
  const id = randomUUID();
  expect((await send(1, "В России", id)).statusCode).toBe(503);
  expect(await read()).toEqual(beforeFailure);
  expect((await send(1, "В России", id)).statusCode).toBe(503);
  expect(await read()).toEqual(beforeFailure);
  expect((await send(1, "В России", id)).statusCode).toBe(200);
  expect((await read()).draft).toMatchObject({
    revision: 2,
    details: { level: "senior", market: "Россия" },
    current: { kind: "proposal", version: 1 },
  });
  expect(model).toHaveBeenCalledTimes(5);

  const beforeCorrection = await read();
  const proposal = beforeCorrection.draft.current;
  if (proposal?.kind !== "proposal") throw new Error("Missing proposal");
  model.mockResolvedValueOnce({
    changes: { level: "middle" },
    replyKind: "proposal",
    reply: proposal.text,
  });
  expect((await send(2, "Нет, всё-таки middle")).statusCode).toBe(503);
  expect(await read()).toEqual(beforeCorrection);
});
