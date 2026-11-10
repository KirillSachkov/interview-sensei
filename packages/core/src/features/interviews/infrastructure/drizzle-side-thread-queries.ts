// The Side threads of Mock interviews in the `interviews` schema, and the hint mark of an asked
// question that a Side thread before the answer sets, and whether the Candidate opened its Debrief.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "../../../shared/storage/index.ts";
import type { SideThread } from "../domain/side-thread.ts";
import type { SideThreadRepository } from "../domain/ports.ts";
import { askedQuestions, interviews, sideThreads } from "./schema.ts";

function toSideThread({
  originKind,
  originId,
  createdAt,
  closedAt,
  sequence: _sequence,
  ...row
}: typeof sideThreads.$inferSelect): SideThread {
  return {
    ...row,
    origin: { kind: originKind, id: originId },
    createdAt: createdAt.toISOString(),
    closedAt: closedAt?.toISOString() ?? null,
  };
}

/** Closes Side threads for good: those given, or every one of a Target's Mock interviews. */
function sideThreadClosing(
  database: Database,
): Pick<SideThreadRepository, "closeSideThreads" | "closeTargetSideThreads"> {
  return {
    closeSideThreads: async (ids, at) => {
      if (ids.length === 0) {
        return;
      }
      await database
        .update(sideThreads)
        .set({ closedAt: new Date(at) })
        .where(and(inArray(sideThreads.id, [...ids]), isNull(sideThreads.closedAt)));
    },
    closeTargetSideThreads: async (targetId, at) => {
      const owned = database
        .select({ id: interviews.id })
        .from(interviews)
        .where(eq(interviews.targetId, targetId));
      await database
        .update(sideThreads)
        .set({ closedAt: new Date(at) })
        .where(and(inArray(sideThreads.interviewId, owned), isNull(sideThreads.closedAt)));
    },
  };
}

export function drizzleSideThreadQueries(database: Database): SideThreadRepository {
  return {
    ...sideThreadClosing(database),
    createSideThread: async ({ origin, createdAt, closedAt, ...thread }) => {
      await database.insert(sideThreads).values({
        ...thread,
        originKind: origin.kind,
        originId: origin.id,
        createdAt: new Date(createdAt),
        closedAt: closedAt === null ? null : new Date(closedAt),
      });
    },
    sideThreads: async (interviewId) => {
      const rows = await database
        .select()
        .from(sideThreads)
        .where(eq(sideThreads.interviewId, interviewId))
        .orderBy(asc(sideThreads.sequence));
      return rows.map((row) => toSideThread(row));
    },
    sideThreadBySession: async (sessionId) => {
      const [row] = await database
        .select()
        .from(sideThreads)
        .where(eq(sideThreads.sessionId, sessionId));
      return row === undefined ? undefined : toSideThread(row);
    },
    continueSideThread: async (id, sessionId) => {
      await database.update(sideThreads).set({ sessionId }).where(eq(sideThreads.id, id));
    },
    markHinted: async (askedQuestionId) => {
      await database
        .update(askedQuestions)
        .set({ hinted: true })
        .where(eq(askedQuestions.id, askedQuestionId));
    },
    markDebriefOpened: async (askedQuestionId) => {
      await database
        .update(askedQuestions)
        .set({ debriefOpened: true })
        .where(eq(askedQuestions.id, askedQuestionId));
    },
    deleteSideThread: async (id) => {
      await database.delete(sideThreads).where(eq(sideThreads.id, id));
    },
  };
}
