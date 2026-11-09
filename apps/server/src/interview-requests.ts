// The bodies of the Mock interview requests. The checks keep JSON types strict, without Fastify's
// coercion, and give the services typed requests.
import type { CandidateReply, StartRequest } from "./composition.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** The body's only field. */
export function onlyField(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null && Object.keys(body).length === 1 && key in body
    ? Reflect.get(body, key)
    : undefined;
}

function sectionIdsOf(sectionIds: unknown): string[] | undefined {
  return Array.isArray(sectionIds) &&
    sectionIds.every((id: unknown) => typeof id === "string" && uuidPattern.test(id))
    ? sectionIds.filter((id: unknown) => typeof id === "string")
    : undefined;
}

const startKeys = new Set(["sectionIds", "limitMinutes", "difficulty"]);

/** No limit, 30 or 60 minutes; undefined for another value. */
function limitOf(limitMinutes: unknown): number | null | undefined {
  return limitMinutes === undefined || limitMinutes === null
    ? null
    : [30, 60].find((choice) => choice === limitMinutes);
}

/** «легче», «как есть» or «сложнее»; null without one, undefined for another value. */
function difficultyOf(difficulty: unknown): StartRequest["difficulty"] | null {
  if (difficulty === undefined) {
    return null;
  }
  return difficulty === "easier" || difficulty === "as_is" || difficulty === "harder"
    ? difficulty
    : undefined;
}

/**
 * The start request of the body `{ sectionIds, limitMinutes?, difficulty? }`; undefined when the
 * body is invalid. Without a difficulty the Target keeps the one of its last Mock interview.
 */
export function startRequestOf(targetId: string, body: unknown): StartRequest | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const field = (key: string): unknown => Reflect.get(body, key);
  const sectionIds = sectionIdsOf(field("sectionIds"));
  const limitMinutes = limitOf(field("limitMinutes"));
  const difficulty = difficultyOf(field("difficulty"));
  if (
    Object.keys(body).some((key) => !startKeys.has(key)) ||
    sectionIds === undefined ||
    limitMinutes === undefined ||
    difficulty === undefined
  ) {
    return undefined;
  }
  return { targetId, sectionIds, limitMinutes, ...(difficulty === null ? {} : { difficulty }) };
}

/** The answer of the body: `{ text }`, `{ optionIds }` or `{ skipped: true }` for «Не знаю». */
export function replyOf(
  body: unknown,
): CandidateReply | "empty_answer" | "invalid_options" | undefined {
  const text = onlyField(body, "text");
  if (typeof text === "string") {
    return text.trim() === "" ? "empty_answer" : { text };
  }
  const optionIds = onlyField(body, "optionIds");
  if (optionIds !== undefined) {
    return Array.isArray(optionIds) && optionIds.every((id: unknown) => typeof id === "string")
      ? { optionIds: optionIds.filter((id: unknown) => typeof id === "string") }
      : "invalid_options";
  }
  return onlyField(body, "skipped") === true ? { skipped: true } : undefined;
}
