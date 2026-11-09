// The fake agent's answers to the server's template messages: the interviewer's for a mock
// interview, and the Inbox processor's and the recheck's for their openings.
import { inboxTurn } from "./fake-agent-inbox.ts";
import { interviewerTurn } from "./fake-agent-interviewer.ts";
import { recheckTurn } from "./fake-agent-recheck.ts";

/** The turn for a template message of the server; null for another prompt. */
export function templateTurn(text: string) {
  return interviewerTurn(text) ?? inboxTurn(text) ?? recheckTurn(text);
}
