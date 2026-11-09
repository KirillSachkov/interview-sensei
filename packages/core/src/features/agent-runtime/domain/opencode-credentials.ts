// The Candidate's OpenCode 2.x provider keys. 2.x keeps them in the `credential` table of its
// own database and imports `auth.json` only when it migrates an existing database; a new one,
// like the session's in the data directory, starts without them. So the recipe passes the keys.

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

/** The API key of the credential JSON, or null for another kind or a broken value. */
function apiKey(value: string): string | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("type" in parsed) ||
      !("key" in parsed)
    ) {
      return null;
    }
    return parsed.type === "key" && typeof parsed.key === "string" && parsed.key !== ""
      ? parsed.key
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

/**
 * The API key of each provider, for the credential OpenCode would use: the active one, otherwise
 * the newest. A provider whose credential is OAuth gets no key: a copied refresh token could
 * rotate and log the Candidate's own OpenCode out.
 */
export function opencodeKeys(rows: readonly OpencodeCredentialRow[]): OpencodeKey[] {
  const chosen = new Map<string, OpencodeCredentialRow>();
  for (const row of rows.toSorted(compareCredentials)) {
    if (row.integration !== null) {
      chosen.set(row.integration, row);
    }
  }
  return [...chosen].flatMap(([provider, row]) => {
    const key = apiKey(row.value);
    return key === null ? [] : [{ provider, key }];
  });
}
