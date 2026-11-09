// The kinds of AgentSession, shared by every slice and the server. A slice that adds a kind adds
// it here; agent-runtime then needs its launch recipe, and the server's composition module its
// MCP tool set: both fail to compile until they have them.

/** The kinds of AgentSession. The skeleton has one: the service chat. */
export const sessionKinds = ["service-chat"] as const;
export type SessionKind = (typeof sessionKinds)[number];

/** Whether the text names a session kind, such as a kind stored by an older version. */
export function isSessionKind(kind: string): kind is SessionKind {
  return sessionKinds.some((known) => known === kind);
}
