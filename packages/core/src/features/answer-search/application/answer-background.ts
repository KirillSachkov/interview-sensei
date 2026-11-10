// «Наполнять в фоне» (spec #70): with the setting on, an answer search of up to 20 Questions starts
// by itself after an Inbox processing ends and after a Mock interview is finished. A start that
// does not happen, such as with nothing to fill or a search that runs, is no error: the server only
// hears why.
import { defaultSearchCount } from "../domain/answer-search.ts";
import type { InboxEnd } from "../domain/ports.ts";
import { inBackground } from "./answer-context.ts";
import type { AnswerContext } from "./answer-context.ts";
import { beginWaiting, start } from "./answer-start.ts";

/** Starts an answer search when «Наполнять в фоне» is on; an archived Target gets none. */
async function fill(context: AnswerContext, targetId: string): Promise<void> {
  const { settings, targets, onBackgroundSkipped } = context.dependencies;
  if (!(await settings.fillInBackground())) {
    return;
  }
  const target = await targets.get(targetId);
  if (target?.status === "archived") {
    onBackgroundSkipped({ targetId, reason: "target_archived" });
    return;
  }
  const outcome = await start(context, { targetId, count: defaultSearchCount });
  if (outcome.type !== "started") {
    onBackgroundSkipped({ targetId, reason: outcome.type });
  }
}

/**
 * The Target's Inbox processing or Recheck ended: its waiting answer search begins first. Then a
 * processing that the agent's report or an early end closed starts a search in the background; a
 * Recheck changes no Questions, and a run closed at the server's start was not the Candidate's.
 */
export function inboxFinished(context: AnswerContext, end: InboxEnd): void {
  inBackground(context, async () => {
    await beginWaiting(context, end.targetId);
    if (end.mode === "processing" && !end.interrupted) {
      await fill(context, end.targetId);
    }
  });
}

/** A Mock interview of the Target is finished, not «прерван»: a search starts in the background. */
export function interviewFinished(context: AnswerContext, targetId: string): void {
  inBackground(context, async () => fill(context, targetId));
}
