// Spec #83, seam 1: a continuation writes nothing into the Candidate's agent directories. The
// Candidate's home is a temporary one with the directories of Claude Code, Codex and OpenCode; the
// data directory lies outside it. «Продолжить» of a paused Mock interview and of a Side thread
// starts a new session with the same launch request as a new one, with no `session/load`, so the
// server leaves the home as it was. The fake agent's recipe does not read the home; the recipes of
// real agents keep their files in the data directory (#42): launch-recipe.test.ts and
// prepare-recipe.int.test.ts.
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { browserHeaders, isIdle, openEvents, temporaryDirectory } from "./chat-test-support.ts";
import { interviewApi } from "./interview-test-support.ts";
import { pauseApi } from "./pause-test-support.ts";
import { firstQuestion, openedSideThread, repliesWith } from "./side-thread-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

/** The agents' own files in the Candidate's home. */
const agentFiles = {
  ".claude/settings.json": '{"model":"opus"}',
  ".claude/projects/session.jsonl": "{}",
  ".codex/config.toml": 'model = "gpt"',
  ".codex/sessions/rollout.jsonl": "{}",
  ".config/opencode/opencode.json": "{}",
};

/** A temporary home with the agents' directories. */
async function candidateHome(): Promise<string> {
  const home = await temporaryDirectory();
  await Promise.all(
    Object.entries(agentFiles).map(async ([file, content]) => {
      await mkdir(path.dirname(path.join(home, file)), { recursive: true });
      await writeFile(path.join(home, file), content);
    }),
  );
  return home;
}

/** Every entry under the directory with its content and modification time, in a stable order. */
async function snapshot(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const lines = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(entry.parentPath, entry.name);
      const { mtimeMs } = await stat(full);
      const content = entry.isFile() ? await readFile(full, "utf8") : "<dir>";
      return `${path.relative(directory, full)} ${String(mtimeMs)} ${content}`;
    }),
  );
  return lines.toSorted();
}

/** Pauses the Mock interview, continues it and waits for the new interviewer's turn. */
async function pausedAndContinued(api: Api, interviewId: string) {
  const pauses = pauseApi(api);
  await pauses.pause(interviewId);
  const view = await pauses.resumed(interviewId);
  const chat = await openEvents(api.server, view.sessionId);
  await chat.waitFor(isIdle);
}

/** Crashes the Side thread's agent and continues the thread once the new agent has spoken. */
async function crashedAndContinued(
  api: Api,
  { interviewId, cardId }: { interviewId: string; cardId: string },
) {
  const { thread, chat } = await openedSideThread(api, { interviewId, cardId });
  await chat.waitFor(isIdle);
  chat.send({ type: "prompt", text: "/crash" });
  await chat.waitFor((view) => view.status === "failed");
  const response = await api.server.inject({
    method: "POST",
    url: `/api/interviews/${interviewId}/side-threads/${thread.id}/continue`,
    headers: browserHeaders(api.server),
  });
  const next = response.json<{ sessionId: string }>();
  const continued = await openEvents(api.server, next.sessionId);
  await continued.waitFor(repliesWith("Продолжаю ветку"));
}

describe("continuation and the agent directories", () => {
  it("writes nothing into the Candidate's agent directories when a mock interview and its side thread continue", async () => {
    const home = await candidateHome();
    const before = await snapshot(home);
    const api = await interviewApi({ userEnvironment: { home, env: { HOME: home } } });
    const { run, card } = await firstQuestion(api);

    await pausedAndContinued(api, run.interview.id);
    await crashedAndContinued(api, { interviewId: run.interview.id, cardId: card.id });

    await expect(snapshot(home)).resolves.toStrictEqual(before);
  });
});
