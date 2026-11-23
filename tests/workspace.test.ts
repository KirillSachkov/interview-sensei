import { expect, it, vi } from "vitest";
import { openWorkspace } from "../apps/server/src/modules/goals-and-scenarios/index.js";

it("opens an existing workspace and creates one for an unknown session", async () => {
  const store = {
    find: vi.fn(async (key: string) => (key === "known" ? "A" : undefined)),
    create: vi.fn(async () => "B"),
  };
  expect(await openWorkspace(store, "known", () => "fresh")).toEqual({
    workspaceId: "A",
  });
  expect(store.create).not.toHaveBeenCalled();
  expect(await openWorkspace(store, "invalid", () => "fresh")).toEqual({
    workspaceId: "B",
    newSecret: "fresh",
  });
  expect(store.create).toHaveBeenCalledWith("fresh");
});
