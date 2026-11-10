// How the stored rows of the `interviews` schema become domain values; both repositories use it.
import { grades } from "../domain/interview.ts";
import type { Attempt, Grade, MockInterview } from "../domain/interview.ts";
import type { attempts, interviews } from "./schema.ts";

export function toGrade(grade: number): Grade {
  const known = grades.find((candidate) => candidate === grade);
  if (known === undefined) {
    throw new Error(`A stored Grade is out of range: ${grade}`);
  }
  return known;
}

export function toInterview(row: typeof interviews.$inferSelect): MockInterview {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    pausedAt: row.pausedAt?.toISOString() ?? null,
    resumedAt: row.resumedAt?.toISOString() ?? null,
    finishRequestedAt: row.finishRequestedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export function toAttempt(row: typeof attempts.$inferSelect): Attempt {
  return { ...row, grade: toGrade(row.grade), recordedAt: row.recordedAt.toISOString() };
}
