import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type { AgentHost } from "../domain/agent.ts";

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

/**
 * Finds the adapters, OpenCode and the Candidate's logins. It only reads: the Candidate's agent
 * directories are never written.
 */
export function inspectAgentHost({ home, env }: UserEnvironment): () => Promise<AgentHost> {
  const codexHome = env.CODEX_HOME ?? path.join(home, ".codex");
  const dataHome = env.XDG_DATA_HOME ?? path.join(home, ".local", "share");
  return async () => ({
    nodeExecutable: process.execPath,
    fakeAgentScript: path.join(import.meta.dirname, "fake-agent.ts"),
    claudeAdapter: adapterScript("@agentclientprotocol/claude-agent-acp", "dist/index.js"),
    codexAdapter: adapterScript("@agentclientprotocol/codex-acp", "dist/index.js"),
    opencodeBinary: await findInPath("opencode", env.PATH),
    codexAuth: await userFile(path.join(codexHome, "auth.json")),
    opencodeAuth: await userFile(path.join(dataHome, "opencode", "auth.json")),
  });
}
