// The token usage an agent reports with the ACP `usage_update` (spec #70): the journal keeps every
// update, and the latest one counts.
import type { AgentUpdate, RecordedEvent } from "./session-event.ts";

/** What the agent reported: the tokens it used and, when it says so, the cost. */
export interface SessionUsage {
  readonly tokens: number;
  readonly cost: { readonly amount: number; readonly currency: string } | null;
}

function costOf(cost: unknown): SessionUsage["cost"] {
  if (typeof cost !== "object" || cost === null) {
    return null;
  }
  const amount: unknown = Reflect.get(cost, "amount");
  const currency: unknown = Reflect.get(cost, "currency");
  return typeof amount === "number" && typeof currency === "string" ? { amount, currency } : null;
}

function usageOf(update: AgentUpdate): SessionUsage | null {
  if (update.sessionUpdate !== "usage_update" || typeof update.used !== "number") {
    return null;
  }
  return { tokens: update.used, cost: costOf(update.cost) };
}

/** The usage of the latest well-formed `usage_update` in the journal; null without one. */
export function sessionUsage(journal: readonly RecordedEvent[]): SessionUsage | null {
  let latest: SessionUsage | null = null;
  for (const { event } of journal) {
    if (event.type === "agent_update") {
      latest = usageOf(event.update) ?? latest;
    }
  }
  return latest;
}
