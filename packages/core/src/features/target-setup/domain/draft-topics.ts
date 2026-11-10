// Topics in the draft of changes. The draft names Topics; a rename gives a Topic a new name, and a
// rename to the name of another Topic merges the first into the second.
import type { Importance } from "./target-values.ts";

/** `from` becomes `to`: the Topic gets the new name, or merges into the Topic named `to`. */
export interface TopicRename {
  readonly from: string;
  readonly to: string;
}

/** The key two Topic names match by: the same words, ignoring case and spaces around them. */
export function topicKey(name: string): string {
  return name.trim().replaceAll(/\s+/gu, " ").toLowerCase();
}

/** The names with `from` replaced by `to`, each Topic once. */
export function renamedTopics(names: readonly string[], { from, to }: TopicRename): string[] {
  const renamed = names.map((name) => (topicKey(name) === topicKey(from) ? to : name));
  return renamed.filter(
    (name, index) => renamed.findIndex((other) => topicKey(other) === topicKey(name)) === index,
  );
}

/** Whether one of the names matches the name of the Topic. */
export function namesTopic(names: readonly string[], name: string): boolean {
  return names.some((other) => topicKey(other) === topicKey(name));
}

/** The importance the draft gives a Topic, named as in the draft. */
export interface TopicImportance {
  readonly topic: string;
  readonly importance: Importance;
}

/** The latest importance of each Topic by topicKey, under the name that the latest change gave. */
export function latestImportance(changes: readonly TopicImportance[]): readonly TopicImportance[] {
  const latest = new Map(changes.map((change) => [topicKey(change.topic), change]));
  return [...latest.values()];
}
