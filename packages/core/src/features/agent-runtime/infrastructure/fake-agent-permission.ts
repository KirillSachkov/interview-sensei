// How the fake agent asks the client's permission for a tool call, like the adapters of real
// agents: it announces the tool call, then asks with only its id.
import type { AgentContext, PermissionOption } from "@agentclientprotocol/sdk/unstable";

/**
 * The options of every permission request, one of each ACP kind. Their names are in English, as
 * real adapters send them, so a test sees that the page names the options by their kind.
 */
export const permissionOptions: PermissionOption[] = [
  { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
  { optionId: "allow-always", name: "Always allow", kind: "allow_always" },
  { optionId: "reject-once", name: "Reject", kind: "reject_once" },
  { optionId: "reject-always", name: "Always reject", kind: "reject_always" },
];

/** Announces the tool call, then asks permission for it with only its id, like an adapter. */
export async function askPermission(
  client: AgentContext,
  sessionId: string,
  toolCall: {
    toolCallId: string;
    title: string;
    kind: "execute" | "other";
    [field: string]: unknown;
  },
) {
  await client.notify("session/update", {
    sessionId,
    update: { sessionUpdate: "tool_call", status: "pending", ...toolCall },
  });
  const { outcome } = await client.request("session/request_permission", {
    sessionId,
    toolCall: { toolCallId: toolCall.toolCallId },
    options: permissionOptions,
  });
  return outcome;
}
