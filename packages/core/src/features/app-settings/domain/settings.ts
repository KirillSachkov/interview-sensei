/** The Candidate's settings of the whole application, not of one Target. */
export interface AppSettings {
  /** The agent of every Target without its own agent; null means the first available agent. */
  readonly defaultAgent: string | null;
  /**
   * «Наполнять в фоне»: an answer search starts by itself after an Inbox processing and after a Mock
   * interview; off by default, so it spends the agent's subscription only by the Candidate's choice.
   */
  readonly fillInBackground: boolean;
}
