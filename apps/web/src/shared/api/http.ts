// What the API modules share: the server's Russian error message and a check of the body.

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The Russian message the server put in an error body, if there is one. */
async function serverMessage(response: Response): Promise<string | undefined> {
  const body: unknown = await response.json().catch(() => null);
  return isObject(body) && typeof body.message === "string" ? body.message : undefined;
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

/** One segment of an API path. */
export const path = (value: string) => encodeURIComponent(value);
