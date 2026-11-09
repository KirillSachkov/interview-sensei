// Unit tests of the Candidate's OpenCode 2.x logins at the start of a session: the runtime reads
// made-up credential rows and hands the recipe to an in-memory launcher.
import { describe, expect, it } from "vitest";

import {
  apiKeyCredentials,
  host,
  ownDatabase,
  runtimeOffering,
} from "./agent-runtime-test-support.ts";
import type { AgentHost } from "./domain/agent.ts";
import type { OpencodeCredentialRow } from "./domain/opencode-credentials.ts";

const database = "/home/candidate/.local/share/opencode/opencode.db";

/** A machine with OpenCode 2.x whose Candidate chose a DeepSeek model. */
const opencode: AgentHost = {
  ...host,
  opencodeBinary: "/opt/homebrew/bin/opencode",
  opencodeVersion: "opencode v2.2.6",
  opencodeDatabase: database,
  opencodeModel: { model: "deepseek/deepseek-flash" },
};

describe("agent runtime with the Candidate's OpenCode 2.x keys", () => {
  it("never reads the OpenCode database to list the agents", async () => {
    const { runtime, databases } = runtimeOffering(["opencode"], opencode);

    await runtime.listAgents();

    expect(databases).toStrictEqual([]);
  });

  it("reads it at the start of an OpenCode 2.x session and passes the keys of its models only", async () => {
    const { start, recipes, databases } = runtimeOffering(["opencode"], opencode);

    await start("opencode");

    expect(databases).toStrictEqual([database, ownDatabase]);
    expect(recipes[0]?.env).toMatchObject({ INTERVIEW_SENSEI_OPENCODE_KEY_1: "sk-deepseek" });
    expect(JSON.stringify(recipes[0]?.env)).not.toContain("sk-minimax");
  });

  it("never reads it for OpenCode 1.x, which reads the linked auth.json", async () => {
    const { start, databases } = runtimeOffering(["opencode"], {
      ...opencode,
      opencodeVersion: "1.18.30",
    });

    await start("opencode");

    expect(databases).toStrictEqual([]);
  });
});

describe("agent runtime with each OpenCode 2.x login (#69)", () => {
  const subscription: OpencodeCredentialRow = {
    id: "cred_1",
    integration: "deepseek",
    value: JSON.stringify({
      type: "oauth",
      methodID: "oauth",
      refresh: "refresh-token",
      access: "access-token",
      expires: 1,
    }),
    active: 1,
    created: 1,
  };

  it("passes an API key login to the session's OpenCode without a warning", async () => {
    const { start, recipes, warnings } = runtimeOffering(["opencode"], opencode);

    await start("opencode");

    expect(recipes[0]?.env).toMatchObject({ INTERVIEW_SENSEI_OPENCODE_KEY_1: "sk-deepseek" });
    expect(JSON.parse(String(recipes[0]?.env.OPENCODE_CONFIG_CONTENT))).toMatchObject({
      providers: { deepseek: { env: ["INTERVIEW_SENSEI_OPENCODE_KEY_1"] } },
    });
    expect(warnings).toStrictEqual([]);
  });

  it("passes no part of a subscription login and warns to log in for the application", async () => {
    // A copied refresh token would rotate and log the Candidate's own OpenCode out.
    const { start, recipes, warnings } = runtimeOffering(["opencode"], opencode, {
      credentials: [subscription],
    });

    await start("opencode");

    const launched = JSON.stringify(recipes[0]);
    expect(launched).not.toContain("refresh-token");
    expect(launched).not.toContain("access-token");
    expect(launched).not.toContain("INTERVIEW_SENSEI_OPENCODE_KEY");
    expect(warnings).toStrictEqual([
      "OpenCode 2.x: deepseek has only a subscription (OAuth) login, which sessions of the application cannot share; run `npx interview-sensei login opencode` once or log in to it with an API key",
    ]);
  });

  it("warns of no subscription login of a provider the session does not use", async () => {
    const { start, warnings } = runtimeOffering(["opencode"], opencode, {
      credentials: [...apiKeyCredentials, { ...subscription, id: "cred_3", integration: "openai" }],
    });

    await start("opencode");

    expect(warnings).toStrictEqual([]);
  });

  it("warns of no subscription login once the application has its own login there", async () => {
    // The session's OpenCode uses the application's own login from its database (#69).
    const ownLogin = {
      ...subscription,
      id: "cred_9",
      value: subscription.value.replace("refresh-token", "own"),
    };
    const { start, recipes, warnings } = runtimeOffering(["opencode"], opencode, {
      credentials: [subscription],
      ownCredentials: [ownLogin],
    });

    await start("opencode");

    expect(warnings).toStrictEqual([]);
    expect(JSON.stringify(recipes[0])).not.toContain("refresh-token");
  });
});
