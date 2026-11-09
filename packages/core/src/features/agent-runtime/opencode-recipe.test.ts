// Seam 1 of #42: the OpenCode recipe writes the config schema of the installed version. The
// version is the made-up output of `opencode --version`; nothing runs OpenCode.
import { describe, expect, it } from "vitest";

import { opencodeConfigSchema } from "./domain/opencode-recipe.ts";
import {
  dataDirectory,
  lockedProfile,
  opencodeConfig,
  opencodeVersions,
  recipe,
} from "./launch-recipe-test-support.ts";

const skills = `${dataDirectory}/agents/opencode/skills/probe-skill`;

/** A 2.x permission rule for every resource of the action. */
function rule(action: string, effect: string) {
  return { action, resource: "*", effect };
}

describe("opencode config schema", () => {
  it.each([
    ["opencode v2.2.6", "2.x"],
    ["opencode v2.0.0\n", "2.x"],
    ["v3.1.0", "2.x"],
    ["1.18.30", "1.x"],
    ["1.0.0\n", "1.x"],
  ])("reads `%s` as the %s schema", (version, schema) => {
    expect(opencodeConfigSchema(version)).toBe(schema);
  });

  it.each([null, "", "local", "opencode", "0.15.8", "error: unknown option"])(
    "falls back to the 1.x schema, which 2.x still reads, for the unknown version %j",
    (version) => {
      expect(opencodeConfigSchema(version)).toBe("1.x");
    },
  );

  it("writes the 1.x keys for OpenCode 1.x and for an unknown version", () => {
    for (const opencodeVersion of [opencodeVersions.v1, null]) {
      expect(opencodeConfig(lockedProfile, { opencodeVersion })).toStrictEqual({
        autoupdate: false,
        share: "disabled",
        permission: { edit: "ask", bash: "ask", webfetch: "ask", external_directory: "ask" },
        skills: { paths: [skills] },
        agent: {
          "interview-sensei": {
            mode: "primary",
            description: "The agent of an Interview Sensei session",
            prompt: lockedProfile.role,
            permission: { bash: "deny", webfetch: "deny", websearch: "deny" },
          },
        },
      });
    }
  });

  it("writes the 2.x keys for OpenCode 2.x and lets only the profile's skill in", () => {
    expect(opencodeConfig(lockedProfile, { opencodeVersion: opencodeVersions.v2 })).toStrictEqual({
      update: "disable",
      share: "disabled",
      permissions: ["edit", "shell", "webfetch", "external_directory"].map((action) =>
        rule(action, "ask"),
      ),
      policies: [
        rule("skill.use", "deny"),
        { ...rule("skill.use", "allow"), resource: "probe-skill" },
      ],
      skills: [skills],
      default_agent: "interview-sensei",
      agents: {
        "interview-sensei": {
          mode: "primary",
          description: "The agent of an Interview Sensei session",
          system: lockedProfile.role,
          permissions: [rule("shell", "deny"), rule("webfetch", "deny"), rule("websearch", "deny")],
        },
      },
    });
  });

  it("never lets OpenCode 2.x use a tool without asking", () => {
    const { permissions, agents } = opencodeConfig(lockedProfile, {
      opencodeVersion: opencodeVersions.v2,
    });
    expect(JSON.stringify({ permissions, agents })).not.toMatch(/"allow"/u);
  });

  it("selects the recipe's own agent as the session's mode in both schemas", () => {
    for (const opencodeVersion of Object.values(opencodeVersions)) {
      expect(recipe("opencode", { opencodeVersion }).mode).toBe("interview-sensei");
    }
  });
});

describe("opencode recipe with the Candidate's model", () => {
  const deepseek = { models: { "deepseek-flash": { name: "DeepSeek Flash" } } };
  const opencodeModel = {
    model: "deepseek/deepseek-flash",
    small_model: "deepseek/deepseek-flash",
    provider: { deepseek },
  };

  it.each(Object.values(opencodeVersions))(
    "puts the Candidate's model keys as they are into the config of OpenCode %s",
    (opencodeVersion) => {
      // OpenCode 2.x migrates the 1.x keys `small_model` and `provider` itself.
      expect(opencodeConfig(lockedProfile, { opencodeModel, opencodeVersion })).toMatchObject({
        ...opencodeModel,
        share: "disabled",
      });
    },
  );

  it("puts the Candidate's model in the 2.x keys as they are into the config of OpenCode 2.x", () => {
    const native = {
      model: { providerID: "deepseek", model: "deepseek-flash" },
      providers: { deepseek },
    };
    const opencodeVersion = opencodeVersions.v2;
    expect(opencodeConfig(lockedProfile, { opencodeModel: native, opencodeVersion })).toMatchObject(
      native,
    );
  });
});

describe("opencode recipe with the Candidate's provider keys", () => {
  const opencodeKeys = [
    { provider: "deepseek", key: "sk-deepseek" },
    { provider: "minimax", key: "sk-minimax" },
  ];
  const v2 = { opencodeKeys, opencodeVersion: opencodeVersions.v2 };

  it("gives OpenCode 2.x each key in its own variable and names it in the provider's entry", () => {
    const launch = recipe("opencode", v2);
    expect(launch.env).toMatchObject({
      INTERVIEW_SENSEI_OPENCODE_KEY_1: "sk-deepseek",
      INTERVIEW_SENSEI_OPENCODE_KEY_2: "sk-minimax",
    });
    expect(opencodeConfig(lockedProfile, v2)).toMatchObject({
      providers: {
        deepseek: { env: ["INTERVIEW_SENSEI_OPENCODE_KEY_1"] },
        minimax: { env: ["INTERVIEW_SENSEI_OPENCODE_KEY_2"] },
      },
    });
  });

  it("keeps the keys out of the config text", () => {
    const config = String(recipe("opencode", v2).env.OPENCODE_CONFIG_CONTENT);
    expect(config).not.toContain("sk-deepseek");
    expect(config).not.toContain("sk-minimax");
  });

  it("adds the key variable to the Candidate's own 2.x provider entry", () => {
    const deepseek = { models: { "deepseek-flash": { name: "DeepSeek Flash" } }, env: ["MY_KEY"] };
    const opencodeModel = { model: "deepseek/deepseek-flash", providers: { deepseek } };
    expect(opencodeConfig(lockedProfile, { ...v2, opencodeModel })).toMatchObject({
      providers: {
        deepseek: { ...deepseek, env: ["INTERVIEW_SENSEI_OPENCODE_KEY_1", "MY_KEY"] },
      },
    });
  });

  it("gives OpenCode 1.x no keys: it reads the linked auth.json", () => {
    const v1 = { opencodeKeys, opencodeVersion: opencodeVersions.v1 };
    const launch = recipe("opencode", v1);
    expect(Object.keys(launch.env).filter((name) => name.includes("KEY"))).toStrictEqual([]);
    expect(opencodeConfig(lockedProfile, v1)).not.toHaveProperty("providers");
  });
});
