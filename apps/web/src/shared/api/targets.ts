export type Level = "junior" | "middle" | "senior";

/** A Target in the list from GET /api/targets; archived Targets are not in it. */
export interface TargetSummary {
  readonly id: string;
  readonly name: string;
  readonly status: "draft" | "active" | "archived";
  readonly level: Level | null;
}

type SectionKind = "conversation" | "topics" | "design";

/** How much a Topic matters for the Target: «высокая», «обычная» or «низкая». */
export type TopicImportance = "high" | "normal" | "low";

/** A Topic of a Section with its importance and number of Questions. */
interface TopicSummary {
  readonly id: string;
  readonly name: string;
  readonly importance: TopicImportance;
  readonly questionCount: number;
}

/** One Section of the Interview plan with its Topics in order. */
export interface PlanSection {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly kind: SectionKind;
  readonly gradingCriteria: string;
  readonly enabled: boolean;
  readonly topics: readonly TopicSummary[];
}

/** A Target with its Interview plan, from GET /api/targets/:id. */
export interface TargetView extends TargetSummary {
  readonly sections: readonly PlanSection[];
}

/** The Target's agent: the Candidate's choice, or the default agent when `chosen` is false. */
export interface TargetAgent {
  /** Null when the Target has no choice and no agent is available. */
  readonly agent: string | null;
  readonly chosen: boolean;
}

export function isTargetSummary(value: unknown): value is TargetSummary {
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

/** The server builds the plan; the web app checks only that it got one. */
export function isTargetView(value: unknown): value is TargetView {
  return isTargetSummary(value) && "sections" in value && Array.isArray(value.sections);
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

function isTargetList(value: unknown): value is TargetSummary[] {
  return Array.isArray(value) && value.every((item: unknown) => isTargetSummary(item));
}

/** The body when it has the expected shape; otherwise an error. */
function checked<Value>(body: unknown, check: (value: unknown) => value is Value): Value {
  if (!check(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** Every Target that is not archived, the oldest first. */
export async function fetchTargets(): Promise<TargetSummary[]> {
  return checked(await readJson(await fetch("/api/targets")), isTargetList);
}

/** The Target with its plan, or null when the address names no Target. */
export async function fetchTarget(id: string): Promise<TargetView | null> {
  const response = await fetch(`/api/targets/${encodeURIComponent(id)}`);
  // The server answers 400 to an id that is not a UUID and 404 to an unknown one.
  if (response.status === 400 || response.status === 404) {
    return null;
  }
  return checked(await readJson(response), isTargetView);
}

/** Creates a new empty draft Target for «Новая цель». */
export async function createTarget(): Promise<TargetView> {
  const response = await fetch("/api/targets", { method: "POST" });
  return checked(await readJson(response), isTargetView);
}

/** Creates the demo Target, or returns it when it exists. */
export async function openDemoTarget(): Promise<TargetSummary> {
  const response = await fetch("/api/targets/demo", { method: "POST" });
  return checked(await readJson(response), isTargetSummary);
}

export async function fetchTargetAgent(targetId: string): Promise<TargetAgent> {
  const response = await fetch(`/api/targets/${encodeURIComponent(targetId)}/agent`);
  return checked(await readJson(response), isTargetAgent);
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
  return checked(await readJson(response), isTargetAgent);
}
