// What the agent of an Inbox processing does with the materials themselves: reads their text part
// by part, which the run records, and gives a material it cannot read «ошибка».
import type { ToolSession } from "../../../shared/mcp/index.ts";
import { runOf, sessionTarget } from "./inbox-context.ts";
import type { InboxContext } from "./inbox-context.ts";

/** Records the part for the run of the session's Target when the material is one of the run's. */
async function recordRead(
  { dependencies }: InboxContext,
  { session, targetId }: { session: ToolSession; targetId: string },
  read: { sourceId: string; part: number },
): Promise<void> {
  const run = await dependencies.inbox.runningRun(targetId);
  const own = run?.sessionId === null || run?.sessionId === session.sessionId;
  if (run !== undefined && own && run.sourceIds.includes(read.sourceId)) {
    await dependencies.inbox.recordRead(run.id, read);
  }
}

/** The part's text and the number of parts; rejects a part the material does not have. */
async function partText(
  { dependencies }: InboxContext,
  { targetId, id, part }: { targetId: string; id: string; part: number },
) {
  const source = await dependencies.repository.get(targetId, id);
  if (source === undefined) {
    throw new Error("Source not found");
  }
  if (source.parts === null) {
    throw new Error(
      "The server could not read this page: open its url on the web and add its Questions without a part, or call mark_source_failed",
    );
  }
  const text = part <= source.parts ? await dependencies.texts.read(targetId, id, part) : undefined;
  if (text === undefined) {
    throw new Error(`The material has parts 1 to ${source.parts}`);
  }
  return { parts: source.parts, text };
}

/**
 * One part of a material's text; the agent reads every part from 1 to `parts`. The run records the
 * part: a partial report counts a material whose every part the agent read as processed.
 */
export async function readSource(
  context: InboxContext,
  session: ToolSession,
  { id, part }: { id: string; part: number },
) {
  const targetId = sessionTarget(session);
  const { parts, text } = await partText(context, { targetId, id, part });
  await recordRead(context, { session, targetId }, { sourceId: id, part });
  return { sourceId: id, part, parts, text };
}

/**
 * Gives a material of the running processing «ошибка» with the agent's reason, such as a page it
 * could not open either. The material stays out of the Inbox until the Candidate attaches it again.
 */
export async function markSourceFailed(
  context: InboxContext,
  session: ToolSession,
  { id, reason }: { id: string; reason: string },
) {
  const { repository, transaction } = context.dependencies;
  return transaction(async (opened) => {
    const { targetId, run } = await runOf(context, session, opened);
    const sources = await repository.list(targetId, opened);
    const source = sources.find((candidate) => candidate.id === id);
    if (source === undefined || !run.sourceIds.includes(id) || source.status !== "processing") {
      throw new Error(`The Source ${id} is not a material of this processing`);
    }
    const change = { ids: [id], status: "failed", failure: reason } as const;
    await repository.setStatus(targetId, change, opened);
    return { id, status: change.status, failure: reason };
  });
}
