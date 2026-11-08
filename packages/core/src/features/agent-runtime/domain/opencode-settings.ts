// What the OpenCode recipe takes from the Candidate's own global config (#24): only the chosen
// models and the provider entries they need. The rest of that config stays out of the isolation.

/**
 * The Candidate's choice of model from the global OpenCode config, and the provider entries those
 * models need; nothing else of that config.
 */
export interface OpencodeModelSettings {
  readonly model?: string;
  readonly small_model?: string;
  readonly provider?: Readonly<Record<string, unknown>>;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The index after the string that starts at `index`. */
function afterString(text: string, index: number): number {
  let end = index + 1;
  while (end < text.length && text[end] !== '"') {
    end += text[end] === "\\" ? 2 : 1;
  }
  return end + 1;
}

/** Rewrites the text outside strings; `step` returns what to keep and where to go on. */
function outsideStrings(
  text: string,
  step: (index: number) => { readonly keep: string; readonly next: number },
): string {
  const parts: string[] = [];
  let index = 0;
  while (index < text.length) {
    const next = text[index] === '"' ? afterString(text, index) : null;
    const { keep, next: after } =
      next === null ? step(index) : { keep: text.slice(index, next), next };
    parts.push(keep);
    index = after;
  }
  return parts.join("");
}

function withoutComments(text: string): string {
  return outsideStrings(text, (index) => {
    if (text.startsWith("//", index)) {
      const end = text.indexOf("\n", index);
      return { keep: "", next: end === -1 ? text.length : end };
    }
    if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      return { keep: "", next: end === -1 ? text.length : end + 2 };
    }
    return { keep: text[index] ?? "", next: index + 1 };
  });
}

function withoutTrailingCommas(text: string): string {
  const closing = /\s*[}\]]/uy;
  return outsideStrings(text, (index) => {
    const char = text[index] ?? "";
    closing.lastIndex = index + 1;
    return { keep: char === "," && closing.test(text) ? "" : char, next: index + 1 };
  });
}

/** A config file as an object, read as JSONC like OpenCode does; empty when it is not one. */
function parseConfig(text: string | null): JsonObject {
  if (text === null) {
    return {};
  }
  try {
    // JSON.parse refuses the byte order mark that some editors put at the start of the file.
    const content = text.startsWith("\uFEFF") ? text.slice(1) : text;
    const parsed: unknown = JSON.parse(withoutTrailingCommas(withoutComments(content)));
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Objects merge key by key, as OpenCode merges its config files; anything else is replaced. */
function mergeDeep(base: JsonObject, over: JsonObject): JsonObject {
  const merged = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = merged[key];
    merged[key] = isObject(current) && isObject(value) ? mergeDeep(current, value) : value;
  }
  return merged;
}

/** The keys this module reads from each file; a later file overrides an earlier one. */
function pick(texts: readonly (string | null)[]): JsonObject {
  return texts.reduce<JsonObject>((merged, text) => {
    const { model, small_model: smallModel, provider } = parseConfig(text);
    return mergeDeep(merged, {
      ...(typeof model === "string" ? { model } : {}),
      ...(typeof smallModel === "string" ? { small_model: smallModel } : {}),
      ...(isObject(provider) ? { provider } : {}),
    });
  }, {});
}

/** The provider part of `provider/model`, or null for a value without one. */
function providerOf(model: unknown): string | null {
  return typeof model === "string" && model.includes("/") ? (model.split("/")[0] ?? null) : null;
}

/**
 * The Candidate's model choice from the texts of the global OpenCode config files, in OpenCode's
 * order (`config.json`, `opencode.json`, `opencode.jsonc`); null for a missing file. It takes
 * only `model`, `small_model` and the `provider` entries of their providers: a model the Candidate
 * defined in the config works only with its entry. MCP servers, permissions, instructions, agents,
 * plugins and the rest stay out. An unreadable file adds nothing.
 */
export function opencodeModelSettings(texts: readonly (string | null)[]): OpencodeModelSettings {
  const { model, small_model: smallModel, provider: providers = {} } = pick(texts);
  const defined = isObject(providers) ? providers : {};
  const provider = Object.fromEntries(
    [providerOf(model), providerOf(smallModel)]
      .filter((id): id is string => id !== null && isObject(defined[id]))
      .map((id) => [id, defined[id]]),
  );
  return {
    ...(typeof model === "string" ? { model } : {}),
    ...(typeof smallModel === "string" ? { small_model: smallModel } : {}),
    ...(Object.keys(provider).length === 0 ? {} : { provider }),
  };
}
