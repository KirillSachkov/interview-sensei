/** The Candidate's settings of the whole application, not of one Target. */
export interface AppSettings {
  /** The agent of every Target without its own agent; null means the first available agent. */
  readonly defaultAgent: string | null;
}
