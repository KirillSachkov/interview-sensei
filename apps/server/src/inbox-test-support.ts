// Helpers of the API tests of Inbox processing (#47): the start by «Запустить разбор», and the
// processing agent's session, which the fake agent's `/tool` drives when a material's title has
// `[manual]`. material-test-support.ts makes the materials of each format.
import type { Clock, Timer } from "@interview-sensei/core/time";
import type { FastifyInstance } from "fastify";
import { expect, vi } from "vitest";

import {
  agentTexts,
  browserHeaders,
  isIdle,
  openEvents,
  startServer,
  temporaryDirectory,
} from "./chat-test-support.ts";
import { first } from "./model-test-support.ts";
import type { TargetView } from "./model-test-support.ts";
import { api, appliedTarget, toolResult } from "./setup-test-support.ts";
import type { Events } from "./setup-test-support.ts";
import { sources, upload } from "./source-test-support.ts";
import type { SourceView } from "./source-test-support.ts";

/** Uploads the file as the setup chat does and resolves with its Source. */
export async function attach(
  server: FastifyInstance,
  { targetId, name, body }: { targetId: string; name: string; body: string | Buffer },
): Promise<SourceView> {
  const response = await upload(server, { targetId, name, body });
  expect(response.statusCode).toBe(201);
  return response.json<SourceView>();
}

/** The proposal, the running processing, the latest report and the materials in the Inbox. */
export interface InboxState {
  readonly proposal: {
    readonly id: string;
    readonly items: readonly {
      readonly sourceId: string;
      readonly type: string;
      readonly title: string;
      readonly size: number | null;
      readonly assessment: string;
    }[];
  } | null;
  readonly recheckProposal: { readonly id: string; readonly reason: string } | null;
  readonly run: {
    readonly id: string;
    readonly mode: string;
    readonly sourceIds: readonly string[];
  } | null;
  readonly latestReport: { readonly id: string; readonly partial: boolean } | null;
  readonly unprocessed: number;
}

export async function inboxOf(server: FastifyInstance, targetId: string): Promise<InboxState> {
  const response = await api(server).get(`/api/targets/${targetId}/inbox`);
  expect(response.statusCode).toBe(200);
  return response.json<InboxState>();
}

/**
 * «Запустить разбор»: the chosen materials, or every material in the Inbox without a choice.
 * `languages` has the language the card chose for a video or audio file, by Source id.
 */
export async function startProcessing(
  server: FastifyInstance,
  targetId: string,
  sourceIds?: readonly string[],
  languages?: Readonly<Record<string, string>>,
) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/inbox/processing`,
    headers: browserHeaders(server),
    payload: {
      ...(sourceIds === undefined ? {} : { sourceIds }),
      ...(languages === undefined ? {} : { languages }),
    },
  });
}

/** The Target's Sources once each is out of «разбирается» or has its parts read. */
export async function sourcesOnceRead(
  server: FastifyInstance,
  targetId: string,
): Promise<SourceView[]> {
  return vi.waitFor(
    async () => {
      const list = await sources(server, targetId);
      expect(list.every((source) => source.status !== "processing" || source.parts !== null)).toBe(
        true,
      );
      return list;
    },
    { timeout: 10_000, interval: 50 },
  );
}

interface SessionSummary {
  readonly id: string;
  readonly kind: string;
  readonly targetId?: string | null;
}

/** The Target's Inbox processing session once the server started it. */
export async function processingSession(
  server: FastifyInstance,
  targetId: string,
): Promise<SessionSummary> {
  return vi.waitFor(
    async () => {
      const response = await api(server).get("/api/sessions");
      const list = response.json<SessionSummary[]>();
      const session = list.find(
        (candidate) => candidate.kind === "inbox-processing" && candidate.targetId === targetId,
      );
      if (session === undefined) {
        throw new Error("The Inbox processing session has not started yet");
      }
      return session;
    },
    { timeout: 10_000, interval: 50 },
  );
}

/**
 * The events of the Target's Inbox processing session after the fake processor's first turn: with a
 * `[manual]` material it waits there for `/tool` commands.
 */
export async function processingEvents(server: FastifyInstance, targetId: string) {
  const session = await processingSession(server, targetId);
  const events = await openEvents(server, session.id);
  await events.waitFor(
    (view) => isIdle(view) && agentTexts(view).some((text) => text.endsWith("Жду команд.")),
  );
  return { session, events };
}

/** The field of a tool's JSON result. */
function fieldOf(result: unknown, key: string): unknown {
  return typeof result === "object" && result !== null ? Reflect.get(result, key) : undefined;
}

/** The text field of a tool's JSON result, such as a part's `text`. */
export function textOf(result: unknown, key = "text"): string {
  const value = fieldOf(result, key);
  if (typeof value !== "string") {
    throw new TypeError(`The result has no text field ${key}`);
  }
  return value;
}

/** The ids of the items of a tool's JSON list, such as the Sources that add_sources added. */
export function idsOf(result: unknown): string[] {
  if (!Array.isArray(result)) {
    throw new TypeError("The result is not a list");
  }
  return result.map((item: unknown) => textOf(item, "id"));
}

/** Adds a link as the setup agent does from the Candidate's text; resolves with its Source id. */
export async function addLink(setup: Events, { title, url }: { title: string; url: string }) {
  const added = await toolResult(setup, "add_sources", { sources: [{ title, url }] });
  const [id] = idsOf(added);
  if (id === undefined) {
    throw new Error("add_sources added nothing");
  }
  return id;
}

/** Every part of the material by read_source, in order. */
export async function readParts(events: Events, id: string, parts: number): Promise<string[]> {
  const texts: string[] = [];
  for (let part = 1; part <= parts; part += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- the agent reads the parts in order
    const read = await toolResult(events, "read_source", { id, part });
    texts.push(textOf(read));
  }
  return texts;
}

export const vacancy = "Вакансия Go\n\nНужно знать горутины, каналы и планировщик.";

/**
 * An active Target with the plan of setupPlan, its setup chat, and a running Inbox processing of a
 * `[manual]` vacancy, whose agent waits for `/tool`. With `notes`, a text file of notes is processed
 * after the vacancy. With `time`, the server runs on that clock and timer.
 */
export async function manualProcessing({
  dataDirectory,
  notes = false,
  time,
}: { dataDirectory?: string; notes?: boolean; time?: { clock: Clock; timer: Timer } } = {}) {
  const { server, stop } = await startServer(dataDirectory ?? (await temporaryDirectory()), time);
  const { target, events: setup } = await appliedTarget(server);
  const file = await attach(server, {
    targetId: target.id,
    name: "vacancy [manual].md",
    body: vacancy,
  });
  const notesFile = notes
    ? await attach(server, { targetId: target.id, name: "notes.md", body: "Каналы и select." })
    : null;
  const started = await startProcessing(server, target.id);
  expect(started.statusCode).toBe(202);
  const { session, events } = await processingEvents(server, target.id);
  return { server, stop, target, setup, file, notes: notesFile, session, events };
}

/** «Остановить разбор». */
export async function stopProcessing(server: FastifyInstance, targetId: string) {
  return server.inject({
    method: "POST",
    url: `/api/targets/${targetId}/inbox/processing/stop`,
    headers: browserHeaders(server),
  });
}

/** The Section of the Target's plan by name. */
export function sectionOf(target: TargetView, name: string): TargetView["sections"][number] {
  const section = target.sections.find((candidate) => candidate.name === name);
  if (section === undefined) {
    throw new Error(`No Section ${name}`);
  }
  return section;
}

/** The first Topic of the Section by name. */
export function topicOf(target: TargetView, sectionName: string): string {
  return first(sectionOf(target, sectionName).topics).id;
}

/**
 * The Candidate attaches a vacancy, the setup agent proposes it, the Candidate starts its
 * processing, and the fake agent processes it to the Inbox report; resolves with the report's id.
 */
export async function processedVacancy(
  server: FastifyInstance,
  { setup, targetId }: { setup: Events; targetId: string },
) {
  const source = await attach(server, { targetId, name: "vacancy.txt", body: "Go" });
  await toolResult(setup, "propose_inbox_processing", {
    sources: [{ id: source.id, assessment: "вакансия" }],
  });
  const started = await startProcessing(server, source.targetId);
  expect(started.statusCode).toBe(202);
  const reportId = await latestReportId(server, source.targetId);
  await sessionEnded(server, await processingSession(server, source.targetId));
  return reportId;
}

/** Waits until the session has ended, such as the processing after its report. */
export async function sessionEnded(server: FastifyInstance, { id }: { id: string }) {
  await vi.waitFor(
    async () => {
      const view = await api(server).get(`/api/sessions/${id}`);
      expect(view.json<{ status: string }>().status).toBe("ended");
    },
    { timeout: 10_000, interval: 50 },
  );
}

/** The id of the Target's latest Inbox report, once the processing has written one. */
export async function latestReportId(server: FastifyInstance, targetId: string): Promise<string> {
  return vi.waitFor(
    async () => {
      const state = await inboxOf(server, targetId);
      return textOf(state.latestReport, "id");
    },
    { timeout: 15_000, interval: 100 },
  );
}

/** The agent's last reply once the agent is idle and has a reply that starts with the prefix. */
export async function replyStartingWith(events: Events, prefix: string): Promise<string> {
  const replied = (view: Parameters<Parameters<Events["waitFor"]>[0]>[0]) =>
    agentTexts(view).some((text) => text.startsWith(prefix));
  const view = await events.waitFor((candidate) => isIdle(candidate) && replied(candidate));
  return agentTexts(view).at(-1) ?? "";
}
