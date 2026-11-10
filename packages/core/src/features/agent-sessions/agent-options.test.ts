// Unit tests of how the session view follows the agent's model and reasoning level (#111). They
// sit at the slice root: domain-is-pure keeps even test imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import { optionsUpdate } from "./domain/agent-options.ts";
import type { AgentSession } from "./domain/agent-session.ts";
import type { SessionEvent } from "./domain/session-event.ts";
import { replay } from "./domain/session-view.ts";

const session: AgentSession = {
  id: "session-1",
  kind: "service-chat",
  agent: "codex",
  status: "idle",
  createdAt: "2026-01-02T03:04:05.000Z",
};

function configUpdate(configOptions: unknown): SessionEvent {
  return { type: "agent_update", update: { sessionUpdate: "config_option_update", configOptions } };
}

function optionsOf(events: readonly SessionEvent[]) {
  return replay(
    session,
    events.map((event, index) => ({ id: index + 1, event })),
  ).options;
}

/** The model as a flat select option, as Claude Code and the fake agent list it. */
const flatModel = {
  id: "model",
  name: "Model",
  category: "model",
  type: "select",
  currentValue: "sonnet",
  options: [
    { value: "sonnet", name: "Sonnet" },
    { value: "opus", name: "Opus", description: "The largest model" },
  ],
};

/** The model with its values in groups, as OpenCode lists the models of each provider. */
const groupedModel = {
  ...flatModel,
  currentValue: "anthropic/opus",
  options: [
    { group: "anthropic", name: "Anthropic", options: [{ value: "anthropic/opus", name: "Opus" }] },
    { group: "openai", name: "OpenAI", options: [{ value: "openai/gpt", name: "GPT" }] },
  ],
};

/** The reasoning level under the id that Codex gives it. */
const level = {
  id: "reasoning_effort",
  name: "Reasoning effort",
  category: "thought_level",
  type: "select",
  currentValue: "medium",
  options: [
    { value: "low", name: "Low" },
    { value: "medium", name: "Medium" },
  ],
};

const mode = {
  id: "mode",
  name: "Mode",
  category: "mode",
  type: "select",
  currentValue: "default",
  options: [{ value: "default", name: "Default" }],
};

describe("session view of the agent's options", () => {
  it("has no model and no level until the agent reports its config options", () => {
    expect(optionsOf([{ type: "session_started", acpSessionId: "acp-1" }])).toStrictEqual({
      model: null,
      effort: null,
    });
  });

  it("shows the model and the level of a config option update with flat values", () => {
    expect(optionsOf([configUpdate([mode, flatModel, level])])).toStrictEqual({
      model: {
        current: "sonnet",
        values: [
          { value: "sonnet", name: "Sonnet" },
          { value: "opus", name: "Opus" },
        ],
      },
      effort: {
        current: "medium",
        values: [
          { value: "low", name: "Low" },
          { value: "medium", name: "Medium" },
        ],
      },
    });
  });

  it("flattens the groups of a model's values in their order", () => {
    expect(optionsOf([configUpdate([groupedModel])]).model).toStrictEqual({
      current: "anthropic/opus",
      values: [
        { value: "anthropic/opus", name: "Opus" },
        { value: "openai/gpt", name: "GPT" },
      ],
    });
  });

  it("clears the level when a later update has no level option, as for a model without levels", () => {
    const options = optionsOf([
      configUpdate([flatModel, level]),
      configUpdate([{ ...flatModel, currentValue: "opus" }]),
    ]);

    expect(options.effort).toBeNull();
    expect(options.model?.current).toBe("opus");
  });

  it("keeps the options over other updates and the turns of the session", () => {
    const options = optionsOf([
      configUpdate([flatModel, level]),
      { type: "prompt_sent", text: "Привет" },
      {
        type: "agent_update",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Ответ" } },
      },
      { type: "turn_ended", stopReason: "end_turn" },
    ]);

    expect(options.model?.current).toBe("sonnet");
    expect(options.effort?.current).toBe("medium");
  });

  it("takes the first select option of a category and ignores options of other types", () => {
    const toggle = {
      id: "fast",
      name: "Fast",
      category: "model",
      type: "boolean",
      currentValue: true,
    };

    expect(optionsOf([configUpdate([toggle, flatModel, groupedModel])]).model?.current).toBe(
      "sonnet",
    );
  });

  it("has no options for a config option update without a list", () => {
    expect(optionsOf([configUpdate([flatModel]), configUpdate(null)])).toStrictEqual({
      model: null,
      effort: null,
    });
  });

  it("names the ACP ids of the options, which differ by agent", () => {
    const update = { sessionUpdate: "config_option_update", configOptions: [flatModel, level] };

    expect(optionsUpdate(update)?.ids).toStrictEqual({
      model: "model",
      effort: "reasoning_effort",
    });
  });
});
