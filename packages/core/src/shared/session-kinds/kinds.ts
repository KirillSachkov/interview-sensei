/** The kinds of AgentSession. The skeleton has one: the service chat, «Проверка агента» in the UI. */
export const sessionKinds = ["service-chat"] as const;
export type SessionKind = (typeof sessionKinds)[number];

/** Whether the text names a session kind, such as a kind stored by an older version. */
export function isSessionKind(kind: string): kind is SessionKind {
  return sessionKinds.some((known) => known === kind);
}
