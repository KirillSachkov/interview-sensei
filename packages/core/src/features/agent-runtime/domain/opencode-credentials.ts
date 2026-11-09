// The Candidate's OpenCode 2.x provider keys. 2.x keeps them in the `credential` table of its
// own database and imports `auth.json` only when it migrates an existing database; a new one,
// like the session's in the data directory, starts without them. So the recipe passes the keys.
import type { OpencodeModelSettings } from "./opencode-settings.ts";

/** A row of the `credential` table of OpenCode 2.x as the server reads it. */
export interface OpencodeCredentialRow {
  readonly id: string;
  /** The provider, as OpenCode's integration id; null for a credential without one. */
  readonly integration: string | null;
  /** The credential as JSON: `{ type: "key", key }`, `{ type: "oauth", … }` or `{ type: "external", … }`. */
  readonly value: string;
  readonly active: number | null;
  readonly created: number;
}

/** A provider's API key; never logged. */
export interface OpencodeKey {
  readonly provider: string;
  readonly key: string;
}

/** What the session can use of a credential: an API key, an OAuth login or neither. */
type CredentialLogin = { readonly type: "key"; readonly key: string } | { readonly type: "oauth" };

/** The login of the credential JSON, or null for another kind or a broken value. */
function credentialLogin(value: string): CredentialLogin | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
      return null;
    }
    if (parsed.type === "oauth") {
      return { type: "oauth" };
    }
    return parsed.type === "key" &&
      "key" in parsed &&
      typeof parsed.key === "string" &&
      parsed.key !== ""
      ? { type: "key", key: parsed.key }
      : null;
  } catch {
    return null;
  }
}

/** OpenCode's order of a provider's credentials: the one it uses comes last. */
function compareCredentials(left: OpencodeCredentialRow, right: OpencodeCredentialRow): number {
  return (
    (left.active ?? 0) - (right.active ?? 0) ||
    left.created - right.created ||
    left.id.localeCompare(right.id)
  );
}

/** The provider of a model given as `provider/model` or as a 2.x reference. */
function providerOf(model: OpencodeModelSettings["model"]): string | null {
  if (model === undefined) {
    return null;
  }
  if (typeof model !== "string") {
    return model.providerID;
  }
  const slash = model.indexOf("/");
  return slash > 0 ? model.slice(0, slash) : null;
}

/**
 * The providers of the Candidate's `model` and `small_model`, or null when the Candidate chose
 * neither: OpenCode then picks a model of any provider with a key.
 */
function sessionProviders({ model, small_model }: OpencodeModelSettings): Set<string> | null {
  if (model === undefined && small_model === undefined) {
    return null;
  }
  return new Set(
    [providerOf(model), providerOf(small_model)].filter((provider) => provider !== null),
  );
}

/** The credential OpenCode would use for each provider the session uses. */
function chosenCredentials(
  rows: readonly OpencodeCredentialRow[],
  model: OpencodeModelSettings,
): Map<string, OpencodeCredentialRow> {
  const used = sessionProviders(model);
  const chosen = new Map<string, OpencodeCredentialRow>();
  for (const row of rows.toSorted(compareCredentials)) {
    if (row.integration !== null && (used === null || used.has(row.integration))) {
      chosen.set(row.integration, row);
    }
  }
  return chosen;
}

/**
 * The API key of each provider the session uses, for the credential OpenCode would use: the
 * active one, otherwise the newest. Without a chosen model every provider gets its key. A
 * provider whose credential is OAuth gets no key: a copied refresh token could rotate and log the
 * Candidate's own OpenCode out.
 */
export function opencodeKeys(
  rows: readonly OpencodeCredentialRow[],
  model: OpencodeModelSettings,
): OpencodeKey[] {
  return [...chosenCredentials(rows, model)].flatMap(([provider, row]) => {
    const login = credentialLogin(row.value);
    return login?.type === "key" ? [{ provider, key: login.key }] : [];
  });
}

/**
 * The providers the session uses whose credential OpenCode would use is a subscription (OAuth)
 * login and that the application's own OpenCode has no login for. The session gets no key from a
 * subscription login (#69); it needs the application's own login, `interview-sensei login
 * opencode`, or an API key.
 */
export function opencodeLoginsToRepeat(
  rows: readonly OpencodeCredentialRow[],
  ownRows: readonly OpencodeCredentialRow[],
  model: OpencodeModelSettings,
): string[] {
  const own = new Set(ownRows.map((row) => row.integration));
  return [...chosenCredentials(rows, model)].flatMap(([provider, row]) =>
    credentialLogin(row.value)?.type === "oauth" && !own.has(provider) ? [provider] : [],
  );
}
