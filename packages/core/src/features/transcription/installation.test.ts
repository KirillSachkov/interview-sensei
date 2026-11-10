import { describe, expect, it } from "vitest";

import { status } from "./application/installation.ts";
import type { InstallationState } from "./application/installation.ts";
import type { Component, ComponentCatalog } from "./domain/components.ts";
import type { ComponentStore } from "./domain/ports.ts";

function component(id: Component["id"]): Component {
  return { id, version: "1", files: [] };
}

const catalog: ComponentCatalog = {
  shared: [component("engine"), component("ffmpeg"), component("vad")],
  ytDlp: component("yt-dlp"),
  models: { "gigaam-v3": component("gigaam-v3"), "parakeet-v3": component("parakeet-v3") },
};

describe(status, () => {
  it("still shows the download when it finishes while the installed components are read", async () => {
    const state: InstallationState = {
      installation: {
        models: ["parakeet-v3"],
        downloaded: 100,
        total: 100,
        controller: new AbortController(),
        done: Promise.resolve(),
      },
      failure: null,
    };
    // The markers are read before the last one is written, and the download ends meanwhile.
    const store: ComponentStore = {
      installed: () => {
        state.installation = null;
        return Promise.resolve(new Set(["engine", "ffmpeg", "vad", "yt-dlp", "gigaam-v3"]));
      },
      install: () => Promise.resolve(),
      remove: () => Promise.resolve(),
    };

    const answer = await status({ catalog, store, onError: () => {} }, state);

    expect(answer).toMatchObject({
      models: [{ installed: true }, { installed: false }],
      installation: { models: ["parakeet-v3"], downloaded: 100, total: 100 },
    });
  });
});
