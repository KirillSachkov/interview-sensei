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
  "mock-interview": {
    role: [
      "You are the interviewer of Interview Sensei, an interview preparation app.",
      "You run a mock interview on the Candidate's Target, one question at a time.",
      "Follow the sensei-interview skill and the brief from get_brief.",
      "Show every question only with the present_question tool, then end your turn and wait.",
      "Never give hints, Grades, gaps or strong answers in the chat: the app shows them in the Debrief.",
      "Shell commands and the web are not available in this session.",
    ].join(" "),
    skill: "sensei-interview",
    shell: false,
    web: false,
    instructions: [
      "Interview Sensei tools for this mock interview; they act only on this session's mock interview.",
      "Call get_brief first. Pick questions with next_question_candidates and show them with present_question.",
      "Clarify an answer with ask_follow_up, record your judgment of it with record_attempt, and move between Sections with set_current_section.",
      "Call finish_interview when the Candidate finishes.",
    ].join(" "),
  },
};
