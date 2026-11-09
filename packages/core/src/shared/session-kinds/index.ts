// The kinds of AgentSession, shared by every slice and the server. A slice that adds a kind adds
// it to `sessionKinds` with its profile in `sessionProfiles`; the server's composition module then
// needs its MCP tool set. Both fail to compile until the new kind has an entry.
export type { SessionKind } from "./kinds.ts";
export { isSessionKind, sessionKinds } from "./kinds.ts";
export type { SessionProfile } from "./profiles.ts";
export { sessionProfiles } from "./profiles.ts";
