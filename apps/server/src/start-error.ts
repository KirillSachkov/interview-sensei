/** A start failure the Candidate can fix: the message replaces the stack trace. */
export class StartError extends Error {
  override name = "StartError";
}
