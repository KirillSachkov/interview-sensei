/**
 * One agent from GET /api/agents and whether the Candidate can choose it now; `reason` says in
 * Russian why not and what to do.
 */
export type AgentAvailability =
  | { readonly agent: string; readonly available: true }
  | { readonly agent: string; readonly available: false; readonly reason: string };

function isAvailability(item: unknown): item is AgentAvailability {
  if (typeof item !== "object" || item === null || !("agent" in item) || !("available" in item)) {
    return false;
  }
  if (typeof item.agent !== "string") {
    return false;
  }
  return (
    item.available === true ||
    (item.available === false && "reason" in item && typeof item.reason === "string")
  );
}

/** Asks the server which agents it offers. */
export async function fetchAgents(): Promise<AgentAvailability[]> {
  const response = await fetch("/api/agents");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body) || !body.every((item: unknown) => isAvailability(item))) {
    throw new Error("неожиданный ответ");
  }
  return body;
}
