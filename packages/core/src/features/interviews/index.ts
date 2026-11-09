import path from "node:path";

import type { SliceMigrations } from "../../shared/storage/index.ts";

export { interviewsModule } from "./module.ts";
export { interviewTools } from "./application/interview-tools.ts";
export { sideThreadTools } from "./application/side-thread-tools.ts";
export type { AnswerOutcome, CandidateReply } from "./application/candidate-answer.ts";
export type { Interviews } from "./application/interviews.ts";
export type { PauseOutcome } from "./application/pauses.ts";
export type { ResumeOutcome, ResumeRequest } from "./application/resume.ts";
export type { StartOutcome, StartRequest } from "./application/start-interview.ts";
export type { SideThreadOutcome, SideThreadRequest } from "./application/side-threads.ts";
export type { ContinueOutcome } from "./application/side-thread-continuation.ts";
export type { SideThread } from "./domain/side-thread.ts";
export { grades } from "./domain/interview.ts";
export type { Difficulty, Grade } from "./domain/interview.ts";
export type { InterviewView } from "./domain/interview-view.ts";

/** The drizzle-kit migrations of the `interviews` schema. */
export const interviewsMigrations: SliceMigrations = {
  schema: "interviews",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};
