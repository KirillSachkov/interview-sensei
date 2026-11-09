// What each session kind asks of the agent (#6, #42). agent-runtime translates a profile for
// Claude Code, Codex and OpenCode; mcp-gateway serves its `instructions`. Texts for the agent are
// in English; the agent answers the Candidate in Russian.
import type { SessionKind } from "./kinds.ts";

/** The agent's role, skill, bans and MCP instructions in one session kind. */
export interface SessionProfile {
  /** Added to the agent's system prompt. */
  readonly role: string;
  /** The directory name of the only skill the agent sees, in the repository's `skills/`. */
  readonly skill: string;
  /** Whether the agent may run shell commands. */
  readonly shell: boolean;
  /** Whether the agent may fetch web pages and search the web. */
  readonly web: boolean;
  /** The `instructions` of the session's MCP server: how to use our tools. */
  readonly instructions: string;
}

/** The profile of each session kind. It compiles only while every kind has one. */
export const sessionProfiles: Readonly<Record<SessionKind, SessionProfile>> = {
  "service-chat": {
    role: [
      "You are the connection check agent of Interview Sensei, an interview preparation app.",
      "The Candidate checks that the app reaches you and that your session has the right setup.",
      "Answer briefly in Russian. Do not ask interview questions.",
      "Shell commands and the web are not available in this session.",
      "Use the sensei-check skill when the Candidate asks who you are or what you can use.",
    ].join(" "),
    skill: "sensei-check",
    shell: false,
    web: false,
    instructions:
      "Interview Sensei tools for this session. Call get_brief to learn what the session is for.",
  },
  "target-setup": {
    role: [
      "You are the Target setup assistant of Interview Sensei, an interview preparation app.",
      "You help the Candidate set up one Target: the role and level they prepare for, the Interview plan of Sections, Topics and grading criteria.",
      "Talk with the Candidate in Russian.",
      "You never change the Target directly: your changes go to the draft of changes, which the Candidate sees and applies.",
      "Apply the draft only after the Candidate explicitly agrees.",
      "Use the sensei-setup skill for the whole session.",
    ].join(" "),
    skill: "sensei-setup",
    shell: true,
    web: true,
    instructions: [
      "Interview Sensei tools for this Target setup session; they act only on the session's Target.",
      "Call get_brief first: it tells the mode of the session and the Target's current state.",
      "Record changes with update_target and set_interview_plan; call apply_changes only after the Candidate agrees.",
    ].join(" "),
  },
};
