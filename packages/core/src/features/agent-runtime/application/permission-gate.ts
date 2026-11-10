// The server's own answers to an agent's permission requests during a session; see
// `domain/permissions.ts` for the rules.
import type { AgentKind } from "../domain/agent.ts";
import { automaticAnswer, refusal } from "../domain/permissions.ts";
import type { AgentUpdate, LiveAgent, SessionRequest, ToolCallFields } from "../domain/ports.ts";

function announcedToolCall(update: AgentUpdate): ToolCallFields | null {
  const { sessionUpdate, toolCallId } = update;
  return (sessionUpdate === "tool_call" || sessionUpdate === "tool_call_update") &&
    typeof toolCallId === "string"
    ? { ...update, toolCallId }
    : null;
}

/** A tool call in these states asks no more permissions. */
const finishedStatuses = new Set(["completed", "failed"]);

/**
 * Keeps the tool calls the agent announced in the current turn, by `toolCallId`, and answers
 * permission requests for our MCP tools by itself. Other requests go to the Candidate, or get the
 * server's refusal when the profile does not `askCandidate`. A finished tool call and the end of
 * the turn remove the kept tool calls.
 */
export function permissionGate(
  { agent, askCandidate }: { agent: AgentKind; askCandidate: boolean },
  request: SessionRequest,
): { session: SessionRequest; endTurn: () => void } {
  const announced = new Map<string, ToolCallFields>();
  const session: SessionRequest = {
    ...request,
    onUpdate: (update) => {
      const toolCall = announcedToolCall(update);
      if (toolCall !== null) {
        if (typeof toolCall.status === "string" && finishedStatuses.has(toolCall.status)) {
          announced.delete(toolCall.toolCallId);
        } else {
          const earlier = announced.get(toolCall.toolCallId);
          announced.set(toolCall.toolCallId, { ...earlier, ...toolCall });
        }
      }
      request.onUpdate(update);
    },
    onPermission: async (permission) => {
      const earlier = announced.get(permission.toolCall.toolCallId);
      const answer = automaticAnswer({
        agent,
        ourServer: request.mcpServer.name,
        request: permission.toolCall,
        announced: earlier,
        options: permission.options,
      });
      if (answer !== null) {
        return answer;
      }
      // The Candidate sees the announced tool call too: the request may carry only its id.
      return askCandidate
        ? request.onPermission({ ...permission, toolCall: { ...earlier, ...permission.toolCall } })
        : refusal(permission.options);
    },
  };
  return {
    session,
    endTurn: () => {
      announced.clear();
    },
  };
}

/** The agent whose turns, however they end, forget the tool calls announced in them. */
export function forgettingTurns(agent: LiveAgent, endTurn: () => void): LiveAgent {
  return {
    ...agent,
    prompt: async (text) => {
      try {
        return await agent.prompt(text);
      } finally {
        endTurn();
      }
    },
  };
}
