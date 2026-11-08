/** The server's health answer from GET /api/health. */
interface ServerHealth {
  readonly status: "ok";
  readonly checkedAt: string;
}

/** Asks the server whether it is up. Rejects when the server or the dev proxy does not answer. */
export async function fetchHealth(): Promise<ServerHealth> {
  const response = await fetch("/api/health");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body: unknown = await response.json();
  if (!isServerHealth(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

function isServerHealth(value: unknown): value is ServerHealth {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    value.status === "ok" &&
    "checkedAt" in value &&
    typeof value.checkedAt === "string"
  );
}
