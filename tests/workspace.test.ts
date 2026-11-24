import { expect, it, vi } from "vitest";
import { openWorkspace } from "../apps/server/src/modules/goals-and-scenarios/index.js";

it("opens an existing workspace and creates one for an unknown session", async () => {
  const createWorkspace = vi.fn(async () => "B");
  expect(await openWorkspace("A", createWorkspace)).toBe("A");
  expect(createWorkspace).not.toHaveBeenCalled();
  expect(await openWorkspace(undefined, createWorkspace)).toBe("B");
  expect(createWorkspace).toHaveBeenCalledOnce();
});
