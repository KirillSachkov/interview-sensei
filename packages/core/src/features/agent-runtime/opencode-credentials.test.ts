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

/** The keys for a Candidate who chose no model: OpenCode may then use any provider. */
function keysWithoutModel(rows: readonly OpencodeCredentialRow[]) {
  return opencodeKeys(rows, {});
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
      keysWithoutModel([
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
    expect(keysWithoutModel([recent, old])).toStrictEqual([
      { provider: "deepseek", key: "sk-new" },
    ]);
    expect(keysWithoutModel([{ ...old, active: 1 }, recent])).toStrictEqual([
      { provider: "deepseek", key: "sk-old" },
    ]);
  });

  it("passes no key for a provider whose chosen credential is OAuth", () => {
    // Copying a refresh token could rotate it and log the Candidate's own OpenCode out.
    expect(
      keysWithoutModel([
        row({ id: "cred_1", created: 1 }),
        row({ id: "cred_2", created: 2, value: oauth }),
      ]),
    ).toStrictEqual([]);
  });

  it("reads the key of the shape written before OpenCode 2.1", () => {
    const legacy = '{"type":"key","key":"sk-legacy","configuration":{"region":"eu"}}';
    expect(keysWithoutModel([row({ value: legacy })])).toStrictEqual([
      { provider: "deepseek", key: "sk-legacy" },
    ]);
  });

  it.each([
    ["no provider", { integration: null }],
    ["an empty key", { value: '{"type":"key","key":""}' }],
    ["a value that is not JSON", { value: "{" }],
    ["an external credential", { value: '{"type":"external","methodID":"cli"}' }],
  ])("skips a credential with %s", (_case, changes) => {
    expect(keysWithoutModel([row(changes)])).toStrictEqual([]);
  });
});

describe("opencode keys of the session's models", () => {
  const rows = [
    row({ id: "cred_1", integration: "deepseek" }),
    row({ id: "cred_2", integration: "minimax", value: '{"type":"key","key":"sk-minimax"}' }),
    row({ id: "cred_3", integration: "opencode", value: '{"type":"key","key":"sk-zen"}' }),
  ];

  it("passes only the keys of the providers of `model` and `small_model`", () => {
    expect(
      opencodeKeys(rows, { model: "deepseek/deepseek-flash", small_model: "minimax/m2" }),
    ).toStrictEqual([
      { provider: "deepseek", key: "sk-deepseek" },
      { provider: "minimax", key: "sk-minimax" },
    ]);
  });

  it("reads the provider of a 2.x model reference", () => {
    expect(
      opencodeKeys(rows, { model: { providerID: "opencode", model: "big-pickle" } }),
    ).toStrictEqual([{ provider: "opencode", key: "sk-zen" }]);
  });

  it("passes every key when the Candidate chose no model, so OpenCode's default still works", () => {
    expect(opencodeKeys(rows, { provider: { deepseek: {} } })).toHaveLength(3);
  });
});
