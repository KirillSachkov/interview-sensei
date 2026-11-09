import { randomUUID } from "node:crypto";

import { demoQuestions, demoTarget } from "../domain/demo-data.ts";
import type { StoredQuestion, Topic } from "../domain/question.ts";

/** The demo Question as a Question of the Target's bank. */
function demoQuestion(
  question: (typeof demoQuestions)[number],
  common: Omit<StoredQuestion, "format" | "options" | "correctOptionIds">,
): StoredQuestion {
  return question.format === "open"
    ? { ...common, format: "open", options: [], correctOptionIds: [] }
    : {
        ...common,
        format: "quiz",
        options: question.options,
        correctOptionIds: question.correctOptionIds,
      };
}

/**
 * The demo Topics and Questions of a new demo Target with new ids, and the id of each demo Topic by
 * its key, for the demo Sections.
 */
export function demoBank(targetId: string, createdAt: string) {
  const keys = new Map<string, string>(demoTarget.topics.map((topic) => [topic.key, randomUUID()]));
  const topicIdOf = (key: string): string => {
    const id = keys.get(key);
    if (id === undefined) {
      throw new Error(`Unknown demo Topic: ${key}`);
    }
    return id;
  };
  const topics: Topic[] = demoTarget.topics.map((topic) => ({
    id: topicIdOf(topic.key),
    targetId,
    name: topic.name,
  }));
  const questions = demoQuestions.map((question) =>
    demoQuestion(question, {
      id: randomUUID(),
      targetId,
      topicId: topicIdOf(question.topicKey),
      text: question.text,
      level: demoTarget.level,
      sourceIds: [],
      unconfirmed: false,
      hidden: false,
      rating: null,
      createdAt,
    }),
  );
  return { topics, questions, topicIdOf };
}
