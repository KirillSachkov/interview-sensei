import { UnreadableSourceError } from "./inbox.ts";

/**
 * A link that is a video the server could not read: unlike a web page, it gets «ошибка», because
 * the agent cannot open a video on the web either.
 */
export class UnreadableVideoError extends UnreadableSourceError {
  override name = "UnreadableVideoError";
}
