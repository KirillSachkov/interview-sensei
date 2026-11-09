// The MCP tools of the Target's materials. Each acts only on the Target of its session.
import { z } from "zod";

import { sessionTool } from "../../../shared/mcp/index.ts";
import type { ToolSession } from "../../../shared/mcp/index.ts";
import type { Sources, SourceView } from "./sources.ts";

function sessionTarget(session: ToolSession): string {
  if (session.targetId === undefined || session.targetId === null) {
    throw new Error("This session has no Target");
  }
  return session.targetId;
}

/** A Source in the list: its metadata without the file's path. */
function listed({ targetId: _targetId, path: _path, ...source }: SourceView) {
  return source;
}

/** A Source with its file's path, which the agent reads. */
function detailed({ targetId: _targetId, ...source }: SourceView) {
  return source;
}

const knownType = z
  .enum(["vacancy", "resume", "transcript"])
  .optional()
  .describe("What the material is, when you know: a vacancy, a resume or a transcript.");

function addSources(sources: Sources) {
  return sessionTool({
    name: "add_sources",
    description:
      "Adds links and notes that the Candidate gave in the text to the Target's materials, such as a vacancy URL or a pasted vacancy. A link keeps its URL; a note's text becomes a file. Files the Candidate attaches are added by the app; do not add them again.",
    input: z.strictObject({
      sources: z
        .array(
          z.union([
            z.strictObject({ type: knownType, title: z.string().trim().min(1), url: z.url() }),
            z.strictObject({
              type: knownType,
              title: z.string().trim().min(1),
              text: z.string().trim().min(1),
            }),
          ]),
        )
        .min(1),
    }),
    run: async (input, session) => {
      const added = await sources.add(sessionTarget(session), input.sources);
      if (added === undefined) {
        throw new Error("Target not found");
      }
      return JSON.stringify(added.map((source) => detailed(source)));
    },
  });
}

function listSources(sources: Sources) {
  return sessionTool({
    name: "list_sources",
    description:
      "Lists the materials of this session's Target in the order they were added: files the Candidate attached, links and notes. Call get_source for the path of a file.",
    input: z.strictObject({}),
    run: async (_input, session) => {
      const list = await sources.list(sessionTarget(session));
      if (list === undefined) {
        throw new Error("Target not found");
      }
      return JSON.stringify(list.map((source) => listed(source)));
    },
  });
}

export function getSource(sources: Sources) {
  return sessionTool({
    name: "get_source",
    description:
      "Returns one material of this session's Target: its type, title, status, and the absolute path of its file or its URL. Read the file at that path to study the material.",
    input: z.strictObject({ id: z.uuid() }),
    run: async ({ id }, session) => {
      const source = await sources.get(sessionTarget(session), id);
      if (source === undefined) {
        throw new Error("Source not found");
      }
      return JSON.stringify(detailed(source));
    },
  });
}

/** The tools of the Target's materials for a Target setup session. */
export function sourceTools(sources: Sources) {
  return [addSources(sources), listSources(sources), getSource(sources)];
}
