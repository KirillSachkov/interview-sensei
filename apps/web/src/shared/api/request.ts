function field(body: unknown, key: string): string | null {
  if (typeof body === "object" && body !== null && key in body) {
    const value: unknown = Reflect.get(body, key);
    return typeof value === "string" ? value : null;
  }
  return null;
}

/**
 * Sends the request with the JSON body, if any, and answers the response's JSON; undefined for an
 * empty answer. Throws an Error with the server's Russian `message` for an error status.
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
  const text = await response.text();
  const parsed: unknown = text === "" ? undefined : JSON.parse(text);
  if (!response.ok) {
    throw new Error(field(parsed, "message") ?? `HTTP ${response.status}`);
  }
  return parsed;
}
