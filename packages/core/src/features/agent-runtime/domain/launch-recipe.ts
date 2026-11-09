// How each agent starts isolated from the Candidate's own instructions, skills and settings
// (#15, the isolation section of #17), with the role, skill and bans of the session's profile
// (#42). Everything the start creates lives in the data directory; the Candidate's agent
// directories are only linked to, for the login. Recipes know profiles, never session kinds.
import { claudeRecipe } from "./claude-recipe.ts";
import { codexRecipe } from "./codex-recipe.ts";
import { opencodeRecipe } from "./opencode-recipe.ts";
import { agentsSkillsRoot } from "./recipe.ts";
import type { LaunchRecipe, LaunchRequest } from "./recipe.ts";

export type { LaunchProfile, LaunchRecipe, LaunchRequest, SkillSource } from "./recipe.ts";

/**
 * The fake agent takes the role and the skill as Codex does and the bans in `_meta`, so tests see
 * what each profile asks for.
 */
function fakeRecipe({
  host,
  profile,
  dataDirectory,
  sessionDirectory,
}: LaunchRequest): LaunchRecipe {
  const skill = agentsSkillsRoot(dataDirectory, "fake", profile.skill);
  return {
    command: host.nodeExecutable,
    args: [host.fakeAgentScript],
    env: {},
    sessionMeta: {
      fakeAgent: {
        disallowedTools: [...(profile.shell ? [] : ["shell"]), ...(profile.web ? [] : ["web"])],
      },
    },
    systemPrompt: profile.role,
    additionalDirectories: [skill.root],
    mode: null,
    cwd: sessionDirectory,
    dataDirectory,
    directories: [...skill.directories, sessionDirectory],
    files: skill.files,
    symlinks: [],
  };
}

/** Turns the agent and the session's profile into the isolated start of the agent; pure. */
export function launchRecipe(request: LaunchRequest): LaunchRecipe {
  switch (request.agent) {
    case "claude": {
      return claudeRecipe(request);
    }
    case "codex": {
      return codexRecipe(request);
    }
    case "opencode": {
      return opencodeRecipe(request);
    }
    case "fake": {
      return fakeRecipe(request);
    }
    default: {
      return request.agent satisfies never;
    }
  }
}

/**
 * Variables of the Candidate's environment that would point an agent at the Candidate's own
 * config instead of the recipe's, or tell it about this server. API keys stay: the Candidate
 * chose them. With `ANTHROPIC_API_KEY` set, Claude Code bills the API instead of the subscription.
 * `CLAUDE_CONFIG_DIR` stays as well: Claude Code keeps its login there, and isolation comes from
 * `settingSources: []`, not from another directory.
 */
const isolationBreakers = new Set(["OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR", "CODEX_HOME"]);
const ownPrefix = "INTERVIEW_SENSEI_";

/** The agent's environment: the Candidate's without the isolation breakers, then the recipe's. */
export function agentEnvironment(
  candidate: Readonly<Record<string, string | undefined>>,
  recipe: Readonly<Record<string, string>>,
): Record<string, string> {
  const kept = Object.entries(candidate).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && !isolationBreakers.has(entry[0]) && !entry[0].startsWith(ownPrefix),
  );
  return { ...Object.fromEntries(kept), ...recipe };
}
