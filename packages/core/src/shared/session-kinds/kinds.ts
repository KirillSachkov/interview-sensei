/**
 * The kinds of AgentSession: the service chat, «Проверка агента» in the UI; the Target setup,
 * «Настройка цели»; the mock interview, where the agent is the interviewer; the Inbox processing,
 * «Разбор материалов», which runs in the background without a chat; the Side thread, where the
 * same agent explains; and the answer search, «Наполнение ответов», which finds reference answers
 * on the web in the background without a chat.
 */
export const sessionKinds = [
  "service-chat",
  "target-setup",
  "mock-interview",
  "inbox-processing",
  "side-thread",
  "answer-search",
] as const;
export type SessionKind = (typeof sessionKinds)[number];

/** Whether the text names a session kind, such as a kind stored by an older version. */
export function isSessionKind(kind: string): kind is SessionKind {
  return sessionKinds.some((known) => known === kind);
}
