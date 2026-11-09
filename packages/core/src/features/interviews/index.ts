import path from "node:path";

import type { SliceMigrations } from "../../shared/storage/index.ts";

export { interviewsModule } from "./module.ts";
export { interviewTools } from "./application/interview-tools.ts";
export type { Interviews } from "./application/interviews.ts";
export type { StartRequest } from "./application/start-interview.ts";
export type { Difficulty } from "./domain/interview.ts";
export type { InterviewView } from "./domain/interview-view.ts";

/** The drizzle-kit migrations of the `interviews` schema. */
export const interviewsMigrations: SliceMigrations = {
  schema: "interviews",
  folder: path.join(import.meta.dirname, "infrastructure", "migrations"),
};
