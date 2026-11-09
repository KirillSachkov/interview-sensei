// The fake agent's Inbox processor mode: on «Inbox processing has started.» it processes every
// material with our MCP tools, as a real processor would, each call after a permission request
// that the server allows.
// - It reads the brief and list_inbox; a material whose title has `[manual]` makes it stop with
//   «Жду команд.», so an API test drives the tools itself with `/tool`.
// - It takes the first Topic of the first enabled Section of kind `topics`, or of the first
//   Section; without one it creates «Из материалов» there with create_topic.
// - For each part of each material it adds one open Question: the part's first line, with the
//   Target's level, the Section's kind, the Source and the part, and a reference answer from the
//   part's first lines.
// - Then write_inbox_report with a summary, no doubts and a proposed Section «Фейковая секция».
// A failed step ends the turn with «Фейковый разборщик сломался: <error>».
import { randomUUID } from "node:crypto";

import type { AgentContext } from "@agentclientprotocol/sdk/unstable";

import { callMcpTool } from "./fake-agent-mcp.ts";
import { askPermission } from "./fake-agent-permission.ts";
import { sendText } from "./fake-agent-text.ts";

const opening = "Inbox processing has started.";

interface Session {
  readonly client: AgentContext;
  readonly sessionId: string;
  readonly server: { readonly name: string; readonly url: string };
}

interface BriefSection {
  readonly id: string;
  readonly kind: string;
  readonly enabled: boolean;
  readonly topics: readonly { readonly id: string }[];
}

interface Material {
  readonly id: string;
  readonly title: string;
  readonly parts: number | null;
}

/** Calls our MCP tool after the permission request that the server allows by itself. */
async function call(
  { client, sessionId, server }: Session,
  name: string,
  input: object,
): Promise<unknown> {
  const outcome = await askPermission(client, sessionId, {
    toolCallId: randomUUID(),
    title: name,
    kind: "other",
    rawInput: input,
    // The structural field the server recognizes our MCP tools by.
    _meta: { fakeAgent: { mcpServer: server.name } },
  });
  if (outcome.outcome !== "selected" || outcome.optionId === "reject-once") {
    throw new Error(`no permission for ${name}`);
  }
  const { text, isError } = await callMcpTool(server.url, name, input);
  if (isError) {
    throw new Error(`${name}: ${text}`);
  }
  return name === "get_brief" ? text : JSON.parse(text);
}

// The fake agent trusts the shapes of our own tools' results.
/* oxlint-disable typescript/no-unsafe-type-assertion -- the results of our own tools */
const briefOf = (result: unknown) => result as string;
const materialsOf = (result: unknown) => result as readonly Material[];
const createdOf = (result: unknown) => result as { readonly id: string };
const partOf = (result: unknown) => result as { readonly text: string };
/* oxlint-enable typescript/no-unsafe-type-assertion */

/** The Target of the brief: the JSON line after «Target:». */
function briefTarget(brief: string): {
  readonly level: string | null;
  readonly sections: readonly BriefSection[];
} {
  const lines = brief.split("\n");
  const parsed: unknown = JSON.parse(lines[lines.indexOf("Target:") + 1] ?? "{}");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the brief of our own tool
  return parsed as { level: string | null; sections: readonly BriefSection[] };
}

/** The Topic the fake processor puts every Question into, and its Section's kind. */
async function topicFor(session: Session, sections: readonly BriefSection[]) {
  const section =
    sections.find((candidate) => candidate.enabled && candidate.kind === "topics") ?? sections[0];
  if (section === undefined) {
    throw new Error("the plan has no Section");
  }
  const existing = section.topics[0]?.id;
  if (existing !== undefined) {
    return { topicId: existing, sectionKind: section.kind };
  }
  const created = createdOf(
    await call(session, "create_topic", { sectionId: section.id, name: "Из материалов" }),
  );
  return { topicId: created.id, sectionKind: section.kind };
}

/** One Question per part: its first line, with a reference answer from its first lines. */
function questionOf(text: string, { sourceId, part }: { sourceId: string; part: number }) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const points = lines.slice(1, 4);
  while (points.length < 3) {
    points.push(`Пункт ${points.length + 1} из части ${part}`);
  }
  const first = lines[0] ?? `Часть ${part}`;
  return { text: first, sourceId, part, referenceAnswer: { points, sample: lines.join(" ") } };
}

interface Placement {
  readonly topicId: string;
  readonly sectionKind: string;
  readonly level: string;
}

/** Reads every part of the material in order and adds one Question for each. */
async function processMaterial(session: Session, material: Material, placement: Placement) {
  for (let part = 1; part <= (material.parts ?? 0); part += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the parts are read in order
    const read = partOf(await call(session, "read_source", { id: material.id, part }));
    const question = { ...questionOf(read.text, { sourceId: material.id, part }), ...placement };
    // oxlint-disable-next-line eslint/no-await-in-loop -- each part's Question after reading it
    await call(session, "add_bank_questions", { questions: [question] });
  }
}

async function report(session: Session, count: number) {
  await call(session, "write_inbox_report", {
    summary: `Фейковый разборщик: разобрано материалов: ${count}.`,
    proposals: {
      sections: [{ name: "Фейковая секция", kind: "topics", reason: "Фейковое предложение." }],
    },
  });
}

/** Where every Question goes: the Topic, its Section's kind and the Target's level. */
async function placementFor(session: Session): Promise<Placement> {
  const target = briefTarget(briefOf(await call(session, "get_brief", {})));
  const topic = await topicFor(session, target.sections);
  return { ...topic, level: target.level ?? "middle" };
}

/** Processes the materials in order, then writes the report. */
async function processMaterials(session: Session, materials: readonly Material[]) {
  const placement = await placementFor(session);
  for (const material of materials) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the materials are read in order
    await processMaterial(session, material, placement);
  }
  await report(session, materials.length);
}

async function processAll(session: Session): Promise<void> {
  const say = async (text: string) => sendText(session.client, session.sessionId, text);
  await say("Начинаю разбор.");
  const materials = materialsOf(await call(session, "list_inbox", {}));
  if (materials.some((material) => material.title.includes("[manual]"))) {
    await say("Жду команд.");
    return;
  }
  await processMaterials(session, materials);
  await say("Разбор завершён.");
}

/** The Inbox processor's turn for the opening message, or null for another prompt. */
export function inboxTurn(text: string) {
  if (!text.startsWith(opening)) {
    return null;
  }
  return async (session: Session) => {
    try {
      await processAll(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await sendText(session.client, session.sessionId, `Фейковый разборщик сломался: ${message}`);
    }
    return { stopReason: "end_turn" as const };
  };
}
