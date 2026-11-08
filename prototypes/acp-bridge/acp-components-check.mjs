// PROTOTYPE: can @acp-components/core act as a passive store fed by events relayed from our server?
// Its update->store reducer (internal fn `G`) is not exported, so we must call store actions ourselves.
import { sessionStore, AcpClient } from "@acp-components/core";
const s = sessionStore.getState();
const sid = "relay-1";
const relayed = [ // shapes copied from logs/claude-drive2.log
  { sessionId: sid, update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "mcp__interview-sensei__present_question", status: "pending", kind: "other", rawInput: {} } },
  { sessionId: sid, update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" } },
  { sessionId: sid, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Вопрос " } } },
  { sessionId: sid, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "показан." } } },
];
for (const { sessionId, update: u } of relayed) {
  s.ensureSession(sessionId);
  if (u.sessionUpdate === "tool_call") s.upsertToolCall(sessionId, { ...u, content: [] });
  if (u.sessionUpdate === "tool_call_update") s.updateToolCall(sessionId, u.toolCallId, { status: u.status });
  if (u.sessionUpdate === "agent_message_chunk") s.appendContent(sessionId, "m1", "agent", u.content); // no messageId from claude -> we must invent one
}
const d = sessionStore.getState().sessions.get(sid);
console.log(JSON.stringify({ messages: d.messages, toolCalls: [...d.pendingToolCalls.values()] }, null, 1));
console.log("AcpClient methods:", Object.getOwnPropertyNames(AcpClient.prototype).join(", "));
