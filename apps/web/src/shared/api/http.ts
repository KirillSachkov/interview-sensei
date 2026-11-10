// What the API modules share: a request with a JSON body, the server's Russian error message and a
// check of the body.

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The Russian message the server put in an error body, if there is one. */
function messageOf(body: unknown): string | undefined {
  return isObject(body) && typeof body.message === "string" ? body.message : undefined;
}

async function serverMessage(response: Response): Promise<string | undefined> {
  return messageOf(await response.json().catch(() => null));
}

/** Throws the server's message, or the HTTP status, for a response that is not OK. */
export async function sent(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error((await serverMessage(response)) ?? `HTTP ${response.status}`);
  }
}

/** The body that passes the check; the server builds it, so the web app checks only its shape. */
export async function checked<Value>(
  response: Response,
  check: (value: unknown) => value is Value,
): Promise<Value> {
  await sent(response);
  const body: unknown = await response.json();
  if (!check(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** A response's text that is not JSON, such as a proxy's HTML page. */
const notJson = Symbol("not JSON");

/** The JSON of a response's text; undefined for an empty text. */
function parsedText(text: string): unknown {
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return notJson;
  }
}

/**
 * Sends the request with the JSON body, if any, and answers the response's JSON; undefined for an
 * empty answer. Throws an Error with the server's Russian `message`, or the HTTP status, for an
 * error status, and «неожиданный ответ» for an OK answer that is not JSON, such as a proxy's page.
 */
export async function request(
  url: string,
  { method = "GET", body }: { method?: string; body?: object } = {},
): Promise<unknown> {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const parsed = parsedText(await response.text());
  if (!response.ok) {
    throw new Error(messageOf(parsed) ?? `HTTP ${response.status}`);
  }
  if (parsed === notJson) {
    throw new Error("неожиданный ответ");
  }
  return parsed;
}

/** One segment of an API path. */
export const path = (value: string) => encodeURIComponent(value);
