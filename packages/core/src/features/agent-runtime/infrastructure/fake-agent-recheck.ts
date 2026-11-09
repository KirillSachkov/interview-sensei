// The fake agent's recheck mode: on «Recheck of the question bank has started.» it reads the brief
// and proposes to hide every visible Question, with the first active Preference in the reason.
// - A Preference with `[manual]` makes it stop with «Жду команд.», so an API test drives the tools
//   itself with `/tool`.
// - It changes nothing: it only calls write_inbox_report with the list `proposals.hide`.
// A failed step ends the turn with «Фейковый перепроверщик сломался: <error>».
import { call } from "./fake-agent-inbox.ts";
import type { Session } from "./fake-agent-inbox.ts";
import { sendText } from "./fake-agent-text.ts";

const opening = "Recheck of the question bank has started.";

/** The JSON line after the heading line of the brief. */
function briefLine(brief: string, heading: string): unknown {
  const lines = brief.split("\n");
  return JSON.parse(lines[lines.indexOf(heading) + 1] ?? "null");
}

/** The active Preferences and the visible Questions of the brief. */
function briefOf(brief: unknown) {
  const text = typeof brief === "string" ? brief : "";
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brief of our own tool
  const target = briefLine(text, "Target:") as { readonly preferences: readonly string[] };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brief of our own tool
  const questions = briefLine(text, "Visible Questions of the bank:") as readonly {
    readonly id: string;
  }[];
  return { preferences: target.preferences, questions };
}

async function recheck(session: Session): Promise<void> {
  const say = async (text: string) => sendText(session.client, session.sessionId, text);
  await say("Начинаю перепроверку.");
  const { preferences, questions } = briefOf(await call(session, "get_brief", {}));
  if (preferences.some((preference) => preference.includes("[manual]"))) {
    await say("Жду команд.");
    return;
  }
  const preference = preferences[0] ?? "без пожеланий";
  await call(session, "write_inbox_report", {
    summary: `Фейковая перепроверка: предлагаю скрыть вопросов: ${questions.length}.`,
    proposals: {
      hide: questions.map(({ id }) => ({
        questionId: id,
        reason: `Не подходит под пожелание «${preference}».`,
      })),
    },
  });
  await say("Перепроверка завершена.");
}

/** The recheck's turn for its opening message, or null for another prompt. */
export function recheckTurn(text: string) {
  if (!text.startsWith(opening)) {
    return null;
  }
  return async (session: Session) => {
    try {
      await recheck(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sendText(
        session.client,
        session.sessionId,
        `Фейковый перепроверщик сломался: ${message}`,
      );
    }
    return { stopReason: "end_turn" as const };
  };
}
