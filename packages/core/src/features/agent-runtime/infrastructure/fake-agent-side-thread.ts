// The fake agent's side thread mode: it answers the server's opening message of a Side thread,
// which it knows by its first sentence, as a real explaining agent would.
// - «The Candidate opened a side thread from a mock interview.»: `get_brief`, then «Разбираю
//   вопрос кандидата: «<candidateQuestion of the brief>»».
// - `/call <name>` in any session calls our MCP tool without arguments after the permission
//   request that the server allows, and replies «MCP <name>: <tool result or error>».
// - A prompt that starts with the server's note «The Candidate discussed question N in a side
//   thread.» first gets «Отметка: <note> », then the reply to the rest of the prompt.
// A failed step ends the turn with «Фейковый интервьюер сломался: <error>».
import type { AgentContext } from "@agentclientprotocol/sdk/unstable";

import { interviewerTurn, turnOf } from "./fake-agent-interviewer.ts";
import { sendText } from "./fake-agent-text.ts";
import type { Steps } from "./fake-agent-interviewer.ts";

/** The Candidate's question of the Handoff brief, or «?» when the brief has none. */
function candidateQuestionOf(brief: string): string {
  const parsed: unknown = JSON.parse(brief);
  const question =
    typeof parsed === "object" && parsed !== null && "candidateQuestion" in parsed
      ? parsed.candidateQuestion
      : null;
  return typeof question === "string" ? question : "?";
}

const opened: Steps = async (actions) => {
  const brief = await actions.call("get_brief", {});
  await actions.say(`Разбираю вопрос кандидата: «${candidateQuestionOf(brief)}»`);
};

/** Calls the tool and replies with its result, or with the error that refused it. */
const callNamed =
  (name: string): Steps =>
  async (actions) => {
    try {
      await actions.say(`MCP ${name}: ${await actions.call(name, {})}`);
    } catch (error) {
      await actions.say(`MCP ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

const callCommand = /^\/call (?<name>[a-z_]+)$/u;

/** The explaining agent's turn for the server's message or `/call`, or null for another prompt. */
function sideThreadTurn(text: string) {
  if (text.startsWith("The Candidate opened a side thread from a mock interview.")) {
    return turnOf(opened);
  }
  const name = callCommand.exec(text)?.groups?.name;
  return name === undefined ? null : turnOf(callNamed(name));
}

/** The turn that calls our MCP tools: the interviewer's or the explaining agent's; null otherwise. */
export function toolTurn(text: string) {
  return interviewerTurn(text) ?? sideThreadTurn(text);
}

const notePrefix = "The Candidate discussed question ";

/** The server's notes at the start of the prompt, one per paragraph, and the prompt after them. */
export function splitNotes(text: string): { notes: string[]; rest: string } {
  const paragraphs = text.split("\n\n");
  const count = paragraphs.findIndex((paragraph) => !paragraph.startsWith(notePrefix));
  const end = count === -1 ? paragraphs.length : count;
  return { notes: paragraphs.slice(0, end), rest: paragraphs.slice(end).join("\n\n") };
}

/** Sends «Отметка: <note> » for each of the server's notes before the reply. */
export async function sayNotes(
  client: AgentContext,
  sessionId: string,
  notes: readonly string[],
): Promise<void> {
  for (const note of notes) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the notes go out in their order
    await sendText(client, sessionId, `Отметка: ${note} `);
  }
}
