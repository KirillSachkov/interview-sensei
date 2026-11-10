// Unit tests of the token usage that an agent reports with the ACP `usage_update`.
import { describe, expect, it } from "vitest";

import type { RecordedEvent, SessionEvent } from "./domain/session-event.ts";
import { sessionUsage } from "./domain/session-usage.ts";

function journal(...events: SessionEvent[]): RecordedEvent[] {
  return events.map((event, index) => ({ id: index + 1, event }));
}

const usage = (fields: Record<string, unknown>): SessionEvent => ({
  type: "agent_update",
  update: { sessionUpdate: "usage_update", ...fields },
});

describe(sessionUsage, () => {
  it("takes the context tokens, the context window and the cost of the agent's latest usage_update", () => {
    const events = journal(
      usage({ used: 1200, size: 200_000 }),
      { type: "turn_ended", stopReason: "end_turn" },
      usage({ used: 5300, size: 200_000, cost: { amount: 0.42, currency: "USD" } }),
    );

    expect(sessionUsage(events)).toStrictEqual({
      contextTokens: 5300,
      contextSize: 200_000,
      cost: { amount: 0.42, currency: "USD" },
    });
  });

  it("is null when the agent sent no usage_update or a malformed one", () => {
    expect(sessionUsage(journal({ type: "turn_ended", stopReason: "end_turn" }))).toBeNull();
    expect(sessionUsage(journal(usage({ used: "many" })))).toBeNull();
  });

  it("leaves out a malformed cost", () => {
    expect(
      sessionUsage(journal(usage({ used: 10, size: 100, cost: { amount: "?" } }))),
    ).toStrictEqual({ contextTokens: 10, contextSize: 100, cost: null });
  });
});
