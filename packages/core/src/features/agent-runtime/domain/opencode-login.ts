// The application's own OpenCode 2.x login (#69). 2.x rotates the refresh token of a
// subscription (OAuth) login at each refresh, so a copy of the Candidate's login would log the
// Candidate's own OpenCode out. The Candidate logs in once more for the application instead:
// OpenCode keeps that login in its database in the application's homes, and the sessions share it.
import type { AgentHost } from "./agent.ts";
import { agentEnvironment } from "./launch-recipe.ts";
import { opencodeConfigSchema, opencodeHomes, opencodeRoot } from "./opencode-recipe.ts";

/** The database of the application's own OpenCode 2.x, which holds its login. */
export function opencodeOwnDatabase(dataDirectory: string): string {
  return `${opencodeHomes(opencodeRoot(dataDirectory)).XDG_DATA_HOME}/opencode/opencode.db`;
}

/** The program to run for the login, or why the application refuses it. */
export type OpencodeLoginCommand =
  | {
      readonly type: "run";
      readonly command: string;
      readonly args: readonly string[];
      readonly cwd: string;
      readonly env: Readonly<Record<string, string>>;
    }
  | { readonly type: "refused"; readonly reason: string };

/**
 * `opencode auth login --standalone` in the application's OpenCode homes; pure. `--standalone`
 * starts a private server: without it the login would go to the Candidate's background OpenCode
 * service and into the Candidate's database. OpenCode 1.x is refused: it writes the login to
 * `auth.json`, which in the application's homes links to the Candidate's file.
 */
export function opencodeLoginCommand(
  host: AgentHost,
  {
    dataDirectory,
    env,
  }: { dataDirectory: string; env: Readonly<Record<string, string | undefined>> },
): OpencodeLoginCommand {
  if (host.opencodeBinary === null) {
    return {
      type: "refused",
      reason: "OpenCode не установлен: команда `opencode` не найдена в PATH.",
    };
  }
  if (host.opencodeVersion === null) {
    return {
      type: "refused",
      reason:
        "Не удалось узнать версию OpenCode: команда `opencode --version` не ответила. Проверьте, что OpenCode запускается.",
    };
  }
  if (opencodeConfigSchema(host.opencodeVersion) !== "2.x") {
    return {
      type: "refused",
      reason: `OpenCode ${host.opencodeVersion} не нуждается во входе для приложения: сессии используют ваш вход в OpenCode. Отдельный вход нужен только OpenCode 2.x.`,
    };
  }
  const root = opencodeRoot(dataDirectory);
  return {
    type: "run",
    command: host.opencodeBinary,
    args: ["auth", "login", "--standalone"],
    cwd: root,
    env: agentEnvironment(env, {
      ...opencodeHomes(root),
      OPENCODE_DISABLE_CLAUDE_CODE: "1",
      OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    }),
  };
}
