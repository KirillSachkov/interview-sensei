// The fake agent's answers to the server's template messages: the interviewer's for a mock
// interview, the Inbox processor's and the recheck's for their openings, and the explaining
// agent's for the opening of a Side thread.
import { inboxTurn } from "./fake-agent-inbox.ts";
import { interviewerTurn } from "./fake-agent-interviewer.ts";
import { recheckTurn } from "./fake-agent-recheck.ts";
import { sideThreadTurn } from "./fake-agent-side-thread.ts";

// The server's notes before a Side thread's prompt are template text too.
export { sayNotes, splitNotes } from "./fake-agent-side-thread.ts";

/** The turn for a template message of the server; null for another prompt. */
export function templateTurn(text: string) {
  return interviewerTurn(text) ?? inboxTurn(text) ?? recheckTurn(text) ?? sideThreadTurn(text);
}
