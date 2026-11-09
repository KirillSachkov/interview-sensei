import { request } from "./request";
import { isTargetSummary, isTargetView } from "./targets";
import type { TargetSummary, TargetView } from "./targets";

function target(id: string): string {
  return `/api/targets/${encodeURIComponent(id)}`;
}

function checkedTarget(body: unknown): TargetView {
  if (!isTargetView(body)) {
    throw new Error("неожиданный ответ");
  }
  return body;
}

/** Moves the active Target to the archive; refused while an agent session of it runs. */
export async function archiveTarget(id: string): Promise<TargetView> {
  return checkedTarget(await request(`${target(id)}/archive`, { method: "POST" }));
}

/** Returns the archived Target to the Target list. */
export async function restoreTarget(id: string): Promise<TargetView> {
  return checkedTarget(await request(`${target(id)}/restore`, { method: "POST" }));
}

/**
 * Deletes the Target with all its data: a draft at once, an archived Target with its exact name.
 */
export async function deleteTarget(id: string, name?: string): Promise<void> {
  await request(target(id), {
    method: "DELETE",
    ...(name === undefined ? {} : { body: { name } }),
  });
}

/** The archived Targets, the oldest first. */
export async function fetchArchivedTargets(): Promise<TargetSummary[]> {
  const body = await request("/api/targets/archived");
  if (!Array.isArray(body) || !body.every((item: unknown) => isTargetSummary(item))) {
    throw new Error("неожиданный ответ");
  }
  return body;
}
