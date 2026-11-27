import { expect, it } from "vitest";
import {
  goalSetups,
  type GoalSetupInterpretation,
  type StoredGoalSetupTurn,
} from "../apps/server/src/modules/goals-and-scenarios/index.js";

it("versions changed details, keeps an open proposal during conversation, and keeps numbering after withdrawal", async () => {
  const turns: StoredGoalSetupTurn[] = [];
  const setup = goalSetups({
    history: () => Promise.resolve(turns),
    find: (_workspaceId, turnId) =>
      Promise.resolve(turns.find((turn) => turn.result.turnId === turnId)),
    append: (_workspaceId, turn) => {
      turns.push(turn);
      return Promise.resolve(true);
    },
  }).open("workspace", "workspace");
  if (!setup) throw new Error("Missing setup");

  const send = (message: string, interpretation: GoalSetupInterpretation) => {
    const revision = turns.length;
    return setup.submit(
      { turnId: `turn-${revision + 1}`, revision, message },
      async (execution) => {
        const decision = execution.decide(
          await execution.load(),
          interpretation,
        );
        if (!decision) throw new Error("Invalid interpretation");
        return execution.save(decision, []);
      },
    );
  };

  const details = { role: "Go-разработчик", level: "middle", market: "Россия" };
  await send("Хочу на middle Go в России", {
    changes: details,
    replyKind: "proposal",
    reply:
      "Готовиться к собеседованиям на позицию Go-разработчика уровня middle на российском рынке.",
  });
  expect((await setup.read()).draft.current).toMatchObject({
    kind: "proposal",
    version: 1,
    turnId: "turn-1",
  });

  const wording = "Подготовиться к интервью на middle Go в России.";
  await send("Я подумаю", {
    changes: {},
    replyKind: "proposal",
    reply: wording,
  });
  expect((await setup.read()).draft.current).toMatchObject({
    kind: "proposal",
    version: 1,
    turnId: "turn-1",
  });

  const seniorWording = "Подготовиться к интервью на senior Go в России.";
  await send("Да, только senior", {
    changes: { level: "senior" },
    replyKind: "proposal",
    reply: seniorWording,
  });
  const revised = await setup.read();
  expect(revised.draft.details).toEqual({ ...details, level: "senior" });
  expect(revised.draft.current).toEqual({
    kind: "proposal",
    version: 2,
    text: seniorWording,
    turnId: "turn-3",
  });

  await send("Повтори формулировку", {
    changes: {},
    replyKind: "conversation",
    reply: seniorWording,
  });
  expect((await setup.read()).draft.current).toEqual(revised.draft.current);

  await send("Россию больше не рассматриваю, пока не решил куда", {
    changes: { market: null },
    replyKind: "conversation",
    reply: "Какие рынки рассматриваешь?",
  });
  expect((await setup.read()).draft).toMatchObject({
    details: { ...details, level: "senior", market: null },
    current: { kind: "question", text: "Какие рынки рассматриваешь?" },
  });

  await send("В Германии", {
    changes: { market: "Германия" },
    replyKind: "proposal",
    reply: "Готовиться к интервью на senior Go на рынке Германии.",
  });
  expect((await setup.read()).draft.current).toMatchObject({
    kind: "proposal",
    version: 3,
    turnId: "turn-6",
  });

  const beforeUnstatedRole = (await setup.read()).draft;
  await send("Можно уточнить цель?", {
    changes: { role: "Аналитик" },
    replyKind: "proposal",
    reply: "Подготовиться к интервью на аналитика.",
  });
  expect((await setup.read()).draft).toEqual({
    ...beforeUnstatedRole,
    revision: 7,
  });
});
