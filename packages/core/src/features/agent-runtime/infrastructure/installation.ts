import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type { Timer } from "../../../shared/time/index.ts";
import type { AgentHost } from "../domain/agent.ts";
import { opencodeModelSettings } from "../domain/opencode-settings.ts";
import { opencodeVersion } from "./opencode-version.ts";

const require = createRequire(import.meta.url);

/** The Candidate's machine as the agents see it: the home directory and the server's env. */
export interface UserEnvironment {
  readonly home: string;
  readonly env: Readonly<Record<string, string | undefined>>;
}

/** The adapter's entry script in this installation's dependencies, or null. */
function adapterScript(packageName: string, script: string): string | null {
  try {
    return path.join(path.dirname(require.resolve(`${packageName}/package.json`)), script);
  } catch {
    return null;
  }
}

async function isFile(file: string): Promise<boolean> {
  try {
    const entry = await stat(file);
    return entry.isFile();
  } catch {
    return false;
  }
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await access(file, constants.X_OK);
    return await isFile(file);
  } catch {
    return false;
  }
}

/** The first executable of the name in PATH, as a shell would find it; null when none is. */
async function findInPath(name: string, searchPath: string | undefined): Promise<string | null> {
  const directories = (searchPath ?? "").split(path.delimiter).filter((entry) => entry !== "");
  const names = process.platform === "win32" ? [`${name}.exe`, `${name}.cmd`] : [name];
  for (const directory of directories) {
    for (const candidate of names) {
      const file = path.join(directory, candidate);
      // oxlint-disable-next-line eslint/no-await-in-loop -- the first match in PATH order wins
      if (await isExecutable(file)) {
        return file;
      }
    }
  }
  return null;
}

async function userFile(file: string) {
  return { path: file, exists: await isFile(file) };
}

/** The file's text, or null when it is missing or unreadable. */
async function textOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** The global config files in OpenCode's merge order; read only, never logged. */
const opencodeConfigFiles = ["config.json", "opencode.json", "opencode.jsonc"];

/**
 * Finds the adapters, OpenCode with its version and the Candidate's logins. It only reads: the
 * Candidate's agent directories are never written. The timer bounds `opencode --version`.
 */
export function inspectAgentHost(
  { home, env }: UserEnvironment,
  timer: Timer,
): () => Promise<AgentHost> {
  const codexHome = env.CODEX_HOME ?? path.join(home, ".codex");
  const dataHome = env.XDG_DATA_HOME ?? path.join(home, ".local", "share");
  const configHome = env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  return async () => {
    const opencodeBinary = await findInPath("opencode", env.PATH);
    return {
      nodeExecutable: process.execPath,
      fakeAgentScript: path.join(import.meta.dirname, "fake-agent.ts"),
      claudeAdapter: adapterScript("@agentclientprotocol/claude-agent-acp", "dist/index.js"),
      codexAdapter: adapterScript("@agentclientprotocol/codex-acp", "dist/index.js"),
      opencodeBinary,
      opencodeVersion: await opencodeVersion(opencodeBinary, { env, timer }),
      codexAuth: await userFile(path.join(codexHome, "auth.json")),
      opencodeAuth: await userFile(path.join(dataHome, "opencode", "auth.json")),
      opencodeModel: opencodeModelSettings(
        await Promise.all(
          opencodeConfigFiles.map((name) => textOrNull(path.join(configHome, "opencode", name))),
        ),
      ),
    };
  };
}
