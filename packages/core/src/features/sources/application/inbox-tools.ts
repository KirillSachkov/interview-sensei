// The MCP tools of Inbox processing: `propose_inbox_processing` of the Target setup, and the tools
// of the `inbox-processing` session. Each acts only on the Target of its session.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { Inbox } from "./inbox.ts";

const levels = ["junior", "middle", "senior"] as const;
const sectionKinds = ["conversation", "topics", "design"] as const;

/** `propose_inbox_processing` of the Target setup: the card «Разбор материалов» in the chat. */
export function proposeInboxProcessing(inbox: Inbox) {
  return sessionTool({
    name: "propose_inbox_processing",
    description:
      "Shows the Candidate a card that proposes Inbox processing of materials in the Inbox (list_sources shows them with status `inbox`): for each, a short assessment in Russian of what it will give, such as «вакансия — добавит темы» or «статья не по теме». The Candidate unticks materials and presses «Запустить разбор» or «Не сейчас». Processing starts only by that button, never by you; a new proposal replaces the open one.",
    input: z.strictObject({
      sources: z
        .array(z.strictObject({ id: z.uuid(), assessment: z.string().trim().min(1).max(300) }))
        .min(1),
    }),
    run: async ({ sources }, session) => {
      const proposal = await inbox.propose(
        session,
        sources.map(({ id, assessment }) => ({ sourceId: id, assessment })),
      );
      return JSON.stringify({ proposalId: proposal.id, shown: proposal.items.length });
    },
  });
}

/** `propose_recheck` of the Target setup: the card «Перепроверка базы» in the chat. */
export function proposeRecheck(inbox: Inbox) {
  return sessionTool({
    name: "propose_recheck",
    description:
      "Shows the Candidate a card that proposes to recheck the Target's question bank against its active Preferences, such as right after the Candidate applied a draft with a new Preference. Give the reason in Russian, such as «Новое пожелание: меньше определений». The recheck runs in the background, changes nothing itself and gives the Candidate a list «скрыть?» to accept. Only the Candidate's button «Запустить перепроверку» starts it, never you; a new proposal replaces the open one.",
    input: z.strictObject({ reason: z.string().trim().min(1).max(300) }),
    run: async ({ reason }, session) => {
      const proposal = await inbox.proposeRecheck(session, reason);
      return JSON.stringify({ proposalId: proposal.id });
    },
  });
}

function inboxBrief(inbox: Inbox) {
  return sessionTool({
    name: "get_brief",
    description:
      "Returns the brief of this Inbox processing: its mode and rules, the Target's Sections with their kinds and Topics by id, the active Preferences, and the materials to process with their number of parts; in a recheck, the Target's visible Questions instead. Call it first.",
    input: z.strictObject({}),
    run: async (_input, session) => inbox.brief(session),
  });
}

function listInbox(inbox: Inbox) {
  return sessionTool({
    name: "list_inbox",
    description:
      "Lists the materials of this Inbox processing: id, type, title, URL, status and `parts`, the number of numbered parts of the text that the server extracted. Read each with read_source. `parts` is null for a web page the server could not read: open its URL on the web.",
    input: z.strictObject({}),
    run: async (_input, session) => JSON.stringify(await inbox.listInbox(session)),
  });
}

function readSource(inbox: Inbox) {
  return sessionTool({
    name: "read_source",
    description:
      "Returns one numbered part of a material's text, which the server extracted from the file or page, and the number of parts. Read every part from 1 to `parts`; a long material is never cut.",
    input: z.strictObject({ id: z.uuid(), part: z.number().int().min(1) }),
    run: async (input, session) => JSON.stringify(await inbox.readSource(session, input)),
  });
}

const referenceAnswer = z.strictObject({
  points: z.array(z.string().trim().min(1)).min(3).max(5),
  sample: z.string().trim().min(1),
});

const materialQuestion = z.strictObject({
  existingQuestionId: z.uuid().optional(),
  topicId: z.uuid(),
  text: z.string().trim().min(1),
  format: z.enum(["open", "quiz"]).default("open"),
  options: z
    .array(z.strictObject({ id: z.string().trim().min(1), text: z.string().trim().min(1) }))
    .default([]),
  correctOptionIds: z.array(z.string().trim().min(1)).default([]),
  level: z.enum(levels),
  sectionKind: z.enum(sectionKinds),
  sourceId: z.uuid().optional(),
  part: z.number().int().min(1).optional(),
  referenceAnswer: referenceAnswer.nullable().optional(),
});

function addBankQuestions(inbox: Inbox) {
  return sessionTool({
    name: "add_bank_questions",
    description:
      "Adds Questions from the materials straight into the Target's bank, each in a Topic by id, with its level, the Section kind it fits, the Source and the number of the part it comes from. A Question from a web page the server could not read (`parts` null) gets its `sourceId` and no `part`. A Question you make up without a material gets no `sourceId`, `part` or `referenceAnswer`; the app marks it «не подтверждён» until the Candidate confirms it. Give `referenceAnswer` only when the material itself answers the Question: 3–5 key points and a short sample answer; the app marks it «из материала». A quiz has options with ids and the ids of the correct ones. For the same meaning found with search_questions, give existingQuestionId to keep that Question. Exact text repeats (ignoring case, spaces and punctuation) match automatically. Repeats count in duplicates; an answer attaches to the existing Question, preserving its identity and question provenance. Topic, format and Section kind must match. answers reports attached, candidate_protected or material_preserved. Candidate and material answers are never overwritten; put conflicting material answers in the report doubtful with both sources. Material answers replace web or agent answers.",
    input: z.strictObject({ questions: z.array(materialQuestion).min(1) }),
    run: async ({ questions }, session) =>
      JSON.stringify(await inbox.addBankQuestions(session, questions)),
  });
}

function createTopic(inbox: Inbox) {
  return sessionTool({
    name: "create_topic",
    description:
      "Creates a Topic inside an existing Section of the plan, by the Section's id from get_brief, and returns its id. A Topic of the same name is reused. Sections themselves never change: propose a new Section in the report instead.",
    input: z.strictObject({ sectionId: z.uuid(), name: z.string().trim().min(1).max(200) }),
    run: async (input, session) => JSON.stringify(await inbox.createTopic(session, input)),
  });
}

function markSourceFailed(inbox: Inbox) {
  return sessionTool({
    name: "mark_source_failed",
    description:
      "Marks a material of this processing «ошибка» with a short reason in Russian, such as «страница не открылась» or «текст нечитаем». Use it only when you cannot read the material: its text is garbled, or a link the server could not read does not open through your web tools either. A readable material off the topic is not an error: say so in the report. The Candidate sees the reason on the card «Материалы».",
    input: z.strictObject({ id: z.uuid(), reason: z.string().trim().min(1).max(300) }),
    run: async (input, session) => JSON.stringify(await inbox.markSourceFailed(session, input)),
  });
}

function writeInboxReport(inbox: Inbox) {
  return sessionTool({
    name: "write_inbox_report",
    description:
      "Writes the Inbox report and finishes the processing; call it once, at the end. Give a short summary in Russian, the Questions you doubt with the reason, and your proposals of new Sections and Preferences, which you never apply yourself. In a recheck, list in `proposals.hide` the Questions of the Target that an active Preference rejects, by id, with the reason in Russian; the Candidate decides. The server adds what was processed, the added Questions and the number of duplicates.",
    input: z.strictObject({
      summary: z.string().trim().min(1),
      doubtful: z
        .array(
          z.strictObject({
            questionId: z.uuid().nullable().default(null),
            text: z.string().trim().min(1),
            reason: z.string().trim().min(1),
          }),
        )
        .default([]),
      proposals: z
        .strictObject({
          sections: z
            .array(
              z.strictObject({
                name: z.string().trim().min(1),
                kind: z.enum(sectionKinds),
                reason: z.string().trim().min(1),
              }),
            )
            .default([]),
          preferences: z
            .array(
              z.strictObject({ text: z.string().trim().min(1), reason: z.string().trim().min(1) }),
            )
            .default([]),
          hide: z
            .array(z.strictObject({ questionId: z.uuid(), reason: z.string().trim().min(1) }))
            .default([]),
        })
        .default({ sections: [], preferences: [], hide: [] }),
    }),
    run: async (input, session) => {
      const report = await inbox.writeReport(session, input);
      return JSON.stringify({ reportId: report.id });
    },
  });
}

/** The tools of the `inbox-processing` session, besides get_target, search_questions and get_source. */
export function inboxTools(inbox: Inbox) {
  return [
    inboxBrief(inbox),
    listInbox(inbox),
    readSource(inbox),
    addBankQuestions(inbox),
    createTopic(inbox),
    markSourceFailed(inbox),
    writeInboxReport(inbox),
  ];
}
