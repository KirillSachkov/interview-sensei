// Seam 2 of #17: what the OpenCode recipe takes from the Candidate's global OpenCode config (#24).
// The texts are made up; nothing touches the disk.
import { describe, expect, it } from "vitest";

import { opencodeModelSettings } from "./domain/opencode-settings.ts";

describe("opencode model settings", () => {
  const deepseek = { models: { "deepseek-flash": { name: "DeepSeek Flash" } } };
  const candidateConfig = {
    $schema: "https://opencode.ai/config.json",
    model: "deepseek/deepseek-flash",
    provider: { deepseek, minimax: { options: { apiKey: "minimax-key" } } },
    mcp: { notes: { type: "local", command: ["notes-mcp"] } },
    permission: { bash: "allow" },
    instructions: ["~/AGENTS.md"],
    agent: { build: { prompt: "Write to Kirill" } },
    plugin: ["herdr-opencode"],
    formatter: false,
  };

  it("takes the model and its provider entry", () => {
    expect(opencodeModelSettings([JSON.stringify(candidateConfig)])).toStrictEqual({
      model: "deepseek/deepseek-flash",
      provider: { deepseek },
    });
  });

  it("takes the small model and its provider entry", () => {
    const config = { small_model: "minimax/m2", provider: candidateConfig.provider };
    expect(opencodeModelSettings([JSON.stringify(config)])).toStrictEqual({
      small_model: "minimax/m2",
      provider: { minimax: candidateConfig.provider.minimax },
    });
  });

  it("ignores every other key, including the Candidate's MCP servers, permissions and instructions", () => {
    const others = { ...candidateConfig, model: undefined, provider: undefined };
    expect(opencodeModelSettings([JSON.stringify(others)])).toStrictEqual({});
  });

  it("passes no provider entry for a provider the Candidate did not define", () => {
    expect(opencodeModelSettings(['{"model":"opencode/big-pickle"}'])).toStrictEqual({
      model: "opencode/big-pickle",
    });
  });

  it("takes nothing from missing files", () => {
    expect(opencodeModelSettings([null, null, null])).toStrictEqual({});
  });

  it("takes nothing from invalid JSON or a model that is not a string", () => {
    expect(
      opencodeModelSettings(['{"model": "deepseek/', "[]", '{"model": 7, "small_model": null}']),
    ).toStrictEqual({});
  });

  it("reads comments and trailing commas of opencode.jsonc", () => {
    const jsonc = `{
      // the Candidate's choice, "quoted // not a comment"
      "model": "deepseek/deepseek-flash", /* inline */
      "small_model": "a//b, }", // a trailing comma before a comment
    }`;
    expect(opencodeModelSettings([jsonc])).toStrictEqual({
      model: "deepseek/deepseek-flash",
      small_model: "a//b, }",
    });
  });

  it("lets a later file override an earlier one, as OpenCode merges them", () => {
    expect(
      opencodeModelSettings(['{"model":"one/a","small_model":"one/b"}', null, '{"model":"two/a"}']),
    ).toStrictEqual({ model: "two/a", small_model: "one/b" });
  });
});
