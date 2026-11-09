/**
 * The kinds of AgentSession: the service chat, «Проверка агента» in the UI, and the Target setup,
 * «Настройка цели».
 */
export const sessionKinds = ["service-chat", "target-setup"] as const;
export type SessionKind = (typeof sessionKinds)[number];

/** Whether the text names a session kind, such as a kind stored by an older version. */
export function isSessionKind(kind: string): kind is SessionKind {
  return sessionKinds.some((known) => known === kind);
}
