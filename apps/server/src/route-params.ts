// The path parameter schemas of the Mock interview routes: the interview and its Attempt.
export const uuid = { type: "string", format: "uuid" } as const;

/** `:id` of a Mock interview or a Target. */
export const params = { type: "object", properties: { id: uuid }, required: ["id"] } as const;

/** `:id` of a Mock interview and `:attemptId` of its Attempt. */
export const attemptParams = {
  type: "object",
  properties: { id: uuid, attemptId: uuid },
  required: ["id", "attemptId"],
} as const;
