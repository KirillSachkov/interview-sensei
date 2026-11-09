// What the fake agent reports about its session's profile:
// - `/system` replies with the ACP `systemPrompt` of `session/new`: «Роль (<mode>): <text>», or
//   «Роль: нет».
// - `/skills` replies with the skills it finds in `.agents/skills` of the `additionalDirectories`
//   of `session/new`, as Codex does, as a sorted JSON array of names: «Skills: <json>». A skill
//   is a directory with a SKILL.md.
// - `/tools` replies with the tools the recipe forbids in `_meta.fakeAgent.disallowedTools`:
//   «Запреты: <json>».
import { readdir } from "node:fs/promises";
import path from "node:path";

import type { NewSessionRequest, SystemPrompt } from "@agentclientprotocol/sdk/unstable";

function describeSystemPrompt(systemPrompt: SystemPrompt | null | undefined): string {
  if (systemPrompt === null || systemPrompt === undefined) {
    return "Роль: нет";
  }
  const text = systemPrompt.content.map((block) => (block.type === "text" ? block.text : ""));
  return `Роль (${systemPrompt.mode}): ${text.join("")}`;
}

/** The skill directories with a SKILL.md in `.agents/skills` of each directory; sorted. */
async function skillsIn(directories: readonly string[]): Promise<string[]> {
  const found = await Promise.all(
    directories.map(async (directory) => {
      const root = path.join(directory, ".agents", "skills");
      const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
      const skills = await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            const files = await readdir(path.join(root, entry.name));
            return files.includes("SKILL.md") ? [entry.name] : [];
          }),
      );
      return skills.flat();
    }),
  );
  return found.flat().toSorted();
}

/** The tools the recipe forbids, from `_meta.fakeAgent.disallowedTools`. */
function disallowedTools(meta: unknown): unknown {
  if (typeof meta !== "object" || meta === null || !("fakeAgent" in meta)) {
    return [];
  }
  const { fakeAgent } = meta;
  return typeof fakeAgent === "object" && fakeAgent !== null && "disallowedTools" in fakeAgent
    ? fakeAgent.disallowedTools
    : [];
}

/** What a session got in `session/new` that the profile sets. */
export interface ProfileSettings {
  readonly meta: unknown;
  readonly systemPrompt: SystemPrompt | null;
  readonly additionalDirectories: readonly string[];
}

/** The reply to a profile command, or null for another prompt. */
export function profileReply(
  text: string,
  settings: ProfileSettings | undefined,
): Promise<string> | null {
  switch (text) {
    case "/system": {
      return Promise.resolve(describeSystemPrompt(settings?.systemPrompt));
    }
    case "/skills": {
      return skillsIn(settings?.additionalDirectories ?? []).then(
        (skills) => `Skills: ${JSON.stringify(skills)}`,
      );
    }
    case "/tools": {
      return Promise.resolve(`Запреты: ${JSON.stringify(disallowedTools(settings?.meta))}`);
    }
    default: {
      return null;
    }
  }
}

/** What `session/new` brings for the profile commands. */
export function profileSettings(params: NewSessionRequest): ProfileSettings {
  return {
    // oxlint-disable-next-line eslint/no-underscore-dangle -- `_meta` is the ACP field's name
    meta: params._meta ?? null,
    systemPrompt: params.systemPrompt ?? null,
    additionalDirectories: params.additionalDirectories ?? [],
  };
}

/**
 * The session capabilities for the profile's role and skill; the fake agent's mode
 * `no-session-capabilities` takes neither.
 */
export function sessionCapabilities(agentMode: string | undefined) {
  return agentMode === "no-session-capabilities"
    ? {}
    : { sessionCapabilities: { systemPrompt: {}, additionalDirectories: {} } };
}
