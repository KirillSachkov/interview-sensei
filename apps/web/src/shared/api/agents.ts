/** One agent from GET /api/agents and whether the Candidate can choose it now. */
export interface AgentAvailability {
  readonly agent: string;
  readonly available: boolean;
}

function isAgentList(value: unknown): value is AgentAvailability[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        "agent" in item &&
        typeof item.agent === "string" &&
        "available" in item &&
        typeof item.available === "boolean",
    )
  );
}

/** Asks the server which agents it offers. */
export async function fetchAgents(): Promise<AgentAvailability[]> {
  const response = await fetch("/api/agents");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isAgentList(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}
