// Which of the Candidate's OpenCode 2.x credentials reach the session's OpenCode. The rows are
// made up; nothing reads a database.
import { describe, expect, it } from "vitest";

import { opencodeKeys } from "./domain/opencode-credentials.ts";
import type { OpencodeCredentialRow } from "./domain/opencode-credentials.ts";

function row(changes: Partial<OpencodeCredentialRow>): OpencodeCredentialRow {
  return {
    id: "cred_1",
    integration: "deepseek",
    value: JSON.stringify({ type: "key", key: "sk-deepseek" }),
    active: null,
    created: 1,
    ...changes,
  };
}

const oauth = JSON.stringify({
  type: "oauth",
  methodID: "oauth",
  refresh: "refresh-token",
  access: "access-token",
  expires: 1,
});

describe("opencode keys", () => {
  it("gives each provider its stored API key", () => {
    expect(
      opencodeKeys([
        row({}),
        row({ id: "cred_2", integration: "minimax", value: '{"type":"key","key":"sk-minimax"}' }),
      ]),
    ).toStrictEqual([
      { provider: "deepseek", key: "sk-deepseek" },
      { provider: "minimax", key: "sk-minimax" },
    ]);
  });

  it("picks the key OpenCode would use: the active one, otherwise the newest", () => {
    const old = row({ id: "cred_1", created: 1, value: '{"type":"key","key":"sk-old"}' });
    const recent = row({ id: "cred_2", created: 2, value: '{"type":"key","key":"sk-new"}' });
    expect(opencodeKeys([recent, old])).toStrictEqual([{ provider: "deepseek", key: "sk-new" }]);
    expect(opencodeKeys([{ ...old, active: 1 }, recent])).toStrictEqual([
      { provider: "deepseek", key: "sk-old" },
    ]);
  });

  it("passes no key for a provider whose chosen credential is OAuth", () => {
    // Copying a refresh token could rotate it and log the Candidate's own OpenCode out.
    expect(
      opencodeKeys([
        row({ id: "cred_1", created: 1 }),
        row({ id: "cred_2", created: 2, value: oauth }),
      ]),
    ).toStrictEqual([]);
  });

  it("reads the key of the shape written before OpenCode 2.1", () => {
    const legacy = '{"type":"key","key":"sk-legacy","configuration":{"region":"eu"}}';
    expect(opencodeKeys([row({ value: legacy })])).toStrictEqual([
      { provider: "deepseek", key: "sk-legacy" },
    ]);
  });

  it.each([
    ["no provider", { integration: null }],
    ["an empty key", { value: '{"type":"key","key":""}' }],
    ["a value that is not JSON", { value: "{" }],
    ["an external credential", { value: '{"type":"external","methodID":"cli"}' }],
  ])("skips a credential with %s", (_case, changes) => {
    expect(opencodeKeys([row(changes)])).toStrictEqual([]);
  });
});
