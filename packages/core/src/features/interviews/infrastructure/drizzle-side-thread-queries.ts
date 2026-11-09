// The Side threads of Mock interviews in the `interviews` schema, and the hint mark of an asked
// question that a Side thread before the answer sets, and whether the Candidate opened its Debrief.
import { asc, eq } from "drizzle-orm";

import type { Database } from "../../../shared/storage/index.ts";
import type { SideThread } from "../domain/side-thread.ts";
import type { SideThreadRepository } from "../domain/ports.ts";
import { askedQuestions, sideThreads } from "./schema.ts";

function toSideThread({
  originKind,
  originId,
  createdAt,
  sequence: _sequence,
  ...row
}: typeof sideThreads.$inferSelect): SideThread {
  return { ...row, origin: { kind: originKind, id: originId }, createdAt: createdAt.toISOString() };
}

export function drizzleSideThreadQueries(database: Database): SideThreadRepository {
  return {
    createSideThread: async ({ origin, createdAt, ...thread }) => {
      await database.insert(sideThreads).values({
        ...thread,
        originKind: origin.kind,
        originId: origin.id,
        createdAt: new Date(createdAt),
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
