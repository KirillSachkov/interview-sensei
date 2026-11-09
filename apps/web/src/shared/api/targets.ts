type Level = "junior" | "middle" | "senior";

/** A Target in the list from GET /api/targets; archived Targets are not in it. */
export interface TargetSummary {
  readonly id: string;
  readonly name: string;
  readonly status: "draft" | "active" | "archived";
  readonly level: Level | null;
}

/** The Target's agent: the Candidate's choice, or the default agent when `chosen` is false. */
export interface TargetAgent {
  /** Null when the Target has no choice and no agent is available. */
  readonly agent: string | null;
  readonly chosen: boolean;
}

function isTargetSummary(value: unknown): value is TargetSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "level" in value
  );
}

function isTargetAgent(value: unknown): value is TargetAgent {
  return (
    typeof value === "object" &&
    value !== null &&
    "agent" in value &&
    (value.agent === null || typeof value.agent === "string") &&
    "chosen" in value &&
    typeof value.chosen === "boolean"
  );
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function expect<Value>(body: unknown, check: (value: unknown) => value is Value): Value {
  if (!check(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** Every Target that is not archived, the oldest first. */
export async function fetchTargets(): Promise<TargetSummary[]> {
  const body = await readJson(await fetch("/api/targets"));
  if (!Array.isArray(body) || !body.every((item: unknown) => isTargetSummary(item))) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** The Target, or null when the address names no Target. */
export async function fetchTarget(id: string): Promise<TargetSummary | null> {
  const response = await fetch(`/api/targets/${encodeURIComponent(id)}`);
  // The server answers 400 to an id that is not a UUID and 404 to an unknown one.
  if (response.status === 400 || response.status === 404) {
    return null;
  }
  return expect(await readJson(response), isTargetSummary);
}

/** Creates the demo Target, or returns it when it exists. */
export async function openDemoTarget(): Promise<TargetSummary> {
  const response = await fetch("/api/targets/demo", { method: "POST" });
  return expect(await readJson(response), isTargetSummary);
}

export async function fetchTargetAgent(targetId: string): Promise<TargetAgent> {
  const response = await fetch(`/api/targets/${encodeURIComponent(targetId)}/agent`);
  return expect(await readJson(response), isTargetAgent);
}

/** Stores the Candidate's choice; null returns the Target to the default agent. */
export async function chooseTargetAgent(
  targetId: string,
  agent: string | null,
): Promise<TargetAgent> {
  const response = await fetch(`/api/targets/${encodeURIComponent(targetId)}/agent`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent }),
  });
  return expect(await readJson(response), isTargetAgent);
}
