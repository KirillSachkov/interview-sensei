// What the routes share: the path parameter schemas of an id and of a Mock interview with its
// Attempt, and the strict check of a body with one field.
export const uuid = { type: "string", format: "uuid" } as const;

/** `:id` of a Target, a Mock interview, an AgentSession or another record. */
export const params = { type: "object", properties: { id: uuid }, required: ["id"] } as const;

/** `:id` of a Mock interview and `:attemptId` of its Attempt. */
export const attemptParams = {
  type: "object",
  properties: { id: uuid, attemptId: uuid },
  required: ["id", "attemptId"],
} as const;

/**
 * The body's only field; undefined when the body has another field or none. The routes check JSON
 * types themselves: Fastify's default schema compiler coerces booleans.
 */
export function onlyField(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null && Object.keys(body).length === 1 && key in body
    ? Reflect.get(body, key)
    : undefined;
}
