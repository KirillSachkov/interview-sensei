import { expect, it } from "vitest";
import {
  goalSetups,
  type GoalSetupInterpretation,
  type StoredGoalSetupTurn,
} from "../apps/server/src/modules/goals-and-scenarios/index.js";

it("versions new wording, keeps an open proposal during conversation, and keeps numbering after withdrawal", async () => {
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
  await send("Сформулируй короче", {
    changes: {},
    replyKind: "proposal",
    reply: wording,
  });
  const revised = await setup.read();
  expect(revised.draft.details).toEqual(details);
  expect(revised.draft.current).toEqual({
    kind: "proposal",
    version: 2,
    text: wording,
    turnId: "turn-2",
  });

  await send("Повтори формулировку", {
    changes: {},
    replyKind: "conversation",
    reply: wording,
  });
  expect((await setup.read()).draft.current).toEqual(revised.draft.current);

  await send("Россию больше не рассматриваю, пока не решил куда", {
    changes: { market: null },
    replyKind: "conversation",
    reply: "Какие рынки рассматриваешь?",
  });
  expect((await setup.read()).draft).toMatchObject({
    details: { ...details, market: null },
    current: { kind: "question", text: "Какие рынки рассматриваешь?" },
  });

  await send("В Германии", {
    changes: { market: "Германия" },
    replyKind: "proposal",
    reply: "Готовиться к интервью на middle Go на рынке Германии.",
  });
  expect((await setup.read()).draft.current).toMatchObject({
    kind: "proposal",
    version: 3,
    turnId: "turn-5",
  });
});
