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

  it("allows once a marked request whose announced tool call carries no marker", () => {
    expect(answer({ request: marked(ourServer), announced: bare })).toStrictEqual(allowed);
  });

  it("leaves to the Candidate an unmarked request with no announced tool call", () => {
    expect(answer({ request: bare })).toBeNull();
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
    expect(answer({ agent: "claude-code", request: marked(ourServer) })).toBeNull();
  });
});
