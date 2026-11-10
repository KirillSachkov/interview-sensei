import type { AgentHost, AgentKind } from "../domain/agent.ts";
import { opencodeKeys, opencodeLoginsToRepeat } from "../domain/opencode-credentials.ts";
import type { OpencodeCredentialRow, OpencodeKey } from "../domain/opencode-credentials.ts";
import { opencodeOwnDatabase } from "../domain/opencode-login.ts";
import { opencodeConfigSchema } from "../domain/opencode-recipe.ts";

export interface SessionKeyDependencies {
  /** Reads the `credential` table of the Candidate's OpenCode 2.x database; none when it cannot. */
  readonly readOpencodeCredentials: (database: string) => Promise<readonly OpencodeCredentialRow[]>;
  /** Gets a problem the Candidate can fix, such as an OpenCode login the session cannot use; no secrets. */
  readonly onWarning: (message: string) => void;
  /** The data directory: the agents' own homes and configs live in it. */
  readonly dataDirectory: string;
}

/**
 * The Candidate's keys for an OpenCode 2.x session, read only now, so listing the agents never
 * touches the secrets. Other agents and 1.x, which reads the linked `auth.json`, get none.
 * A provider of the session with only a subscription (OAuth) login gets no key (#69); without
 * the application's own login for it, the runtime warns how to log in.
 */
export async function sessionKeys(
  agent: AgentKind,
  host: AgentHost,
  { readOpencodeCredentials: read, onWarning, dataDirectory }: SessionKeyDependencies,
): Promise<readonly OpencodeKey[]> {
  if (
    agent !== "opencode" ||
    host.opencodeDatabase === null ||
    opencodeConfigSchema(host.opencodeVersion) !== "2.x"
  ) {
    return [];
  }
  const rows = await read(host.opencodeDatabase);
  const ownRows = await read(opencodeOwnDatabase(dataDirectory));
  for (const provider of opencodeLoginsToRepeat(rows, ownRows, host.opencodeModel)) {
    onWarning(
      `OpenCode 2.x: ${provider} has only a subscription (OAuth) login, which sessions of the application cannot share; run \`npx interview-sensei login opencode\` once or log in to it with an API key`,
    );
  }
  return opencodeKeys(rows, host.opencodeModel);
}
