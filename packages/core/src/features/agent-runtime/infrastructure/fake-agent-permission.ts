// How the fake agent asks the client for permission, like a real ACP adapter.
import type { AgentContext, PermissionOption } from "@agentclientprotocol/sdk/unstable";

/** The options of every permission request, like those of a real adapter. */
export const permissionOptions: PermissionOption[] = [
  { optionId: "allow-once", name: "Разрешить", kind: "allow_once" },
  { optionId: "allow-always", name: "Разрешать всегда", kind: "allow_always" },
  { optionId: "reject-once", name: "Отклонить", kind: "reject_once" },
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
