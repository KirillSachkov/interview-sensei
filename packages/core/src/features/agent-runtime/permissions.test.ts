// Unit tests of the rule that decides which permission requests the server answers by itself.
// They sit at the slice root: domain-is-pure keeps even test imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import { automaticAnswer } from "./domain/permissions.ts";
import type { PermissionOption, ToolCallFields } from "./domain/ports.ts";

const ourServer = "interview-sensei-1a2b3c4d";

const allowOnce: PermissionOption = { optionId: "allow", name: "Разрешить", kind: "allow_once" };
const allowAlways: PermissionOption = {
  optionId: "always",
  name: "Разрешать всегда",
  kind: "allow_always",
};
const rejectOnce: PermissionOption = { optionId: "reject", name: "Отклонить", kind: "reject_once" };
const allOptions = [allowOnce, allowAlways, rejectOnce];

/** A tool call that the fake agent marks as a call of the named MCP server. */
function marked(server: string, fields: Record<string, unknown> = {}): ToolCallFields {
  return { toolCallId: "call-1", ...fields, _meta: { fakeAgent: { mcpServer: server } } };
}

const bare: ToolCallFields = { toolCallId: "call-1" };

function answer({
  request,
  announced,
  options = allOptions,
  agent = "fake",
}: {
  request: ToolCallFields;
  announced?: ToolCallFields;
  options?: readonly PermissionOption[];
  agent?: string;
}) {
  return automaticAnswer({ agent, ourServer, request, announced, options });
}

const allowed = { outcome: "selected", optionId: "allow" };

describe("automatic answer to a permission request", () => {
  it("allows once a request that carries our server's marker", () => {
    expect(answer({ request: marked(ourServer) })).toStrictEqual(allowed);
  });

  it("allows once a request whose earlier announced tool call carries our marker", () => {
    expect(
      answer({ request: bare, announced: marked(ourServer, { kind: "other" }) }),
    ).toStrictEqual(allowed);
  });

  it("leaves to the Candidate a request whose marker names a foreign server", () => {
    expect(answer({ request: marked("interview-sensei") })).toBeNull();
    expect(answer({ request: bare, announced: marked("other-server") })).toBeNull();
  });

  it("leaves to the Candidate a request where our marker and a foreign one are mixed", () => {
    expect(answer({ request: marked(ourServer), announced: marked("other-server") })).toBeNull();
    expect(answer({ request: marked("other-server"), announced: marked(ourServer) })).toBeNull();
  });

  it("leaves to the Candidate a request whose kind differs from the marked announced tool call", () => {
    expect(
      answer({
        request: { toolCallId: "call-1", kind: "execute" },
        announced: marked(ourServer, { kind: "other" }),
      }),
    ).toBeNull();
  });

  it("leaves to the Candidate a marked request that offers no allow_once option", () => {
    expect(answer({ request: marked(ourServer), options: [rejectOnce] })).toBeNull();
  });

  it("never picks allow_always, even when it is the only allowing option", () => {
    expect(answer({ request: marked(ourServer), options: [allowAlways, rejectOnce] })).toBeNull();
  });

  it("leaves to the Candidate a request whose title names our tool without a marker", () => {
    const titled = {
      toolCallId: "call-1",
      title: `mcp__${ourServer}__get_brief`,
      rawInput: { server: ourServer },
    };
    expect(answer({ request: titled, announced: titled })).toBeNull();
  });

  it("leaves to the Candidate a request of an agent kind it does not know", () => {
    // An agent kind that a later ticket adds before it teaches the rule its fields.
    expect(answer({ agent: "gemini", request: marked(ourServer) })).toBeNull();
  });
});

describe("automatic answer when a tool call carries no marker", () => {
  it("allows once a marked request whose announced tool call carries no marker", () => {
    expect(answer({ request: marked(ourServer), announced: bare })).toStrictEqual(allowed);
  });

  it("leaves to the Candidate an unmarked request with no announced tool call", () => {
    expect(answer({ request: bare })).toBeNull();
  });
});

// Shapes observed from claude-agent-acp 0.101.0 in a live run (#24): the `tool_call` names the
// tool only, and the permission request adds the SDK's `mcpServer`.
describe("automatic answer for Claude Code", () => {
  const claudeOptions: PermissionOption[] = [
    { optionId: "allow-once", name: "Yes", kind: "allow_once" },
    {
      optionId: "allow-with-updates",
      name: "Yes, and don't ask again for Get Brief commands",
      kind: "allow_always",
    },
    { optionId: "reject", name: "No", kind: "reject_once" },
  ];
  const toolName = `mcp__${ourServer}__get_brief`;
  const announced: ToolCallFields = {
    toolCallId: "toolu_01",
    title: toolName,
    kind: "other",
    status: "pending",
    rawInput: {},
    _meta: { claudeCode: { toolName } },
  };
  function claudeRequest(mcpServer: unknown): ToolCallFields {
    return { ...announced, _meta: { claudeCode: { toolName, mcpServer } } };
  }

  it("allows once a call of our MCP server from session/new", () => {
    expect(
      automaticAnswer({
        agent: "claude",
        ourServer,
        request: claudeRequest({ name: ourServer, source: "dynamic" }),
        announced,
        options: claudeOptions,
      }),
    ).toStrictEqual({ outcome: "selected", optionId: "allow-once" });
  });

  it("leaves to the Candidate a server with our name from settings or a plugin", () => {
    for (const source of ["user", "project", "plugin", "sdk"]) {
      expect(
        automaticAnswer({
          agent: "claude",
          ourServer,
          request: claudeRequest({ name: ourServer, source }),
          announced,
          options: claudeOptions,
        }),
      ).toBeNull();
    }
  });

  it("leaves to the Candidate a shell command and a tool that only its name ties to us", () => {
    const bash: ToolCallFields = {
      toolCallId: "toolu_02",
      kind: "execute",
      title: "touch probe.txt",
      rawInput: { command: "touch probe.txt" },
    };
    const withBashMeta = { ...bash, _meta: { claudeCode: { toolName: "Bash" } } };
    expect(
      automaticAnswer({
        agent: "claude",
        ourServer,
        request: bash,
        announced: withBashMeta,
        options: claudeOptions,
      }),
    ).toBeNull();
    expect(
      automaticAnswer({
        agent: "claude",
        ourServer,
        request: announced,
        announced,
        options: claudeOptions,
      }),
    ).toBeNull();
  });
});

/** An MCP tool call of the server as codex-acp announces it. */
function mcpToolCall(server: string): ToolCallFields {
  return {
    toolCallId: "call_1",
    kind: "execute",
    title: `mcp.${server}.get_brief`,
    status: "pending",
    rawInput: { server, tool: "get_brief", arguments: {} },
    _meta: { is_mcp_tool_call: true },
  };
}
// Shapes from the codex-acp 2.5.0 sources (McpToolReporter, ElicitationReporter); not yet seen in
// a live run. The MCP `tool_call` carries the marker; the approval request repeats only its id and
// kind and puts `is_mcp_tool_approval` outside the tool call.
describe("automatic answer for Codex", () => {
  const codexOptions: PermissionOption[] = [
    { optionId: "allow_once", name: "Allow", kind: "allow_once" },
    { optionId: "cancel", name: "Cancel", kind: "reject_once" },
  ];
  const approval: ToolCallFields = { toolCallId: "call_1", kind: "execute", status: "pending" };

  function codexAnswer(request: ToolCallFields, announced?: ToolCallFields) {
    return automaticAnswer({
      agent: "codex",
      ourServer,
      request,
      announced,
      options: codexOptions,
    });
  }

  it("allows once the approval of our announced MCP tool call", () => {
    expect(codexAnswer(approval, mcpToolCall(ourServer))).toStrictEqual({
      outcome: "selected",
      optionId: "allow_once",
    });
  });

  it("leaves to the Candidate the approval of another MCP server's tool", () => {
    expect(codexAnswer(approval, mcpToolCall("interview-sensei"))).toBeNull();
  });

  it("leaves to the Candidate a tool call that names our server without the MCP marker", () => {
    const command = { ...mcpToolCall(ourServer), _meta: {} };
    expect(codexAnswer(approval, command)).toBeNull();
  });

  it("leaves to the Candidate an approval with no announced tool call or another kind", () => {
    expect(codexAnswer(approval)).toBeNull();
    expect(codexAnswer({ ...approval, kind: "edit" }, mcpToolCall(ourServer))).toBeNull();
  });
});
