// «Проверка агента» (the `service-chat` kind) through the server's HTTP and WebSocket API: the
// fake agent reports the role, skills and bans its profile gave it (seam 2 of #42).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  agentTexts,
  isIdle,
  readyChat,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import type { SessionView } from "./chat-test-support.ts";

/** The repository's own skill of «Проверка агента». */
const senseiCheck = path.join(import.meta.dirname, "..", "..", "..", "skills", "sensei-check");

/** Sends the prompt in a new chat and returns the agent's whole reply. */
async function replyTo(server: Awaited<ReturnType<typeof startServer>>["server"], text: string) {
  const { events } = await readyChat(server);
  events.send({ type: "prompt", text });
  const answered = await events.waitFor(
    (view: SessionView) => isIdle(view) && agentTexts(view).length > 0,
  );
  return agentTexts(answered).join("");
}

/** Where the fake agent's recipe copies the skill: `.agents/skills` of its additional directory. */
function copiedSkill(dataDirectory: string, name: string): string {
  const root = path.join(dataDirectory, "agents", "fake", "skills", name);
  return path.join(root, ".agents", "skills", name, "SKILL.md");
}

describe("agent check", () => {
  it("gives the agent the connection check role as an appended system prompt", async () => {
    const { server } = await startServer(await temporaryDirectory());

    const reply = await replyTo(server, "/system");

    expect(reply).toMatch(
      /^Роль \(append\): You are the connection check agent of Interview Sensei/u,
    );
    expect(reply).toContain("Answer briefly in Russian.");
  });

  it("gives the agent exactly the sensei-check skill", async () => {
    const { server } = await startServer(await temporaryDirectory());

    await expect(replyTo(server, "/skills")).resolves.toBe('Skills: ["sensei-check"]');
  });

  it("forbids the agent shell and web", async () => {
    const { server } = await startServer(await temporaryDirectory());

    await expect(replyTo(server, "/tools")).resolves.toBe('Запреты: ["shell","web"]');
  });

  it("copies the repository's sensei-check skill into the data directory", async () => {
    const dataDirectory = await temporaryDirectory();
    const { server } = await startServer(dataDirectory);

    await replyTo(server, "/skills");

    await expect(readFile(copiedSkill(dataDirectory, "sensei-check"), "utf8")).resolves.toBe(
      await readFile(path.join(senseiCheck, "SKILL.md"), "utf8"),
    );
  });

  it("copies the skill again at each start, so a changed skill reaches the next session", async () => {
    const dataDirectory = await temporaryDirectory();
    const skillsDirectory = await temporaryDirectory();
    const skill = path.join(skillsDirectory, "sensei-check", "SKILL.md");
    await mkdir(path.dirname(skill));
    await writeFile(skill, "---\nname: sensei-check\ndescription: First.\n---\n");
    const { server } = await startServer(dataDirectory, { skillsDirectory });
    await replyTo(server, "/skills");

    await writeFile(skill, "---\nname: sensei-check\ndescription: Second.\n---\n");
    await replyTo(server, "/skills");

    await expect(readFile(copiedSkill(dataDirectory, "sensei-check"), "utf8")).resolves.toBe(
      "---\nname: sensei-check\ndescription: Second.\n---\n",
    );
  });
});
