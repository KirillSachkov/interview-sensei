/**
 * The model and the reasoning level the Candidate chose for an agent (#111), as the values of the
 * agent's own options; null leaves the agent's own default.
 */
export interface AgentModel {
  readonly model: string | null;
  readonly effort: string | null;
}

/** The Candidate's settings of the whole application, not of one Target. */
export interface AppSettings {
  /** The agent of every Target without its own agent; null means the first available agent. */
  readonly defaultAgent: string | null;
  /**
   * «Наполнять в фоне»: an answer search starts by itself after an Inbox processing and after a Mock
   * interview; off by default, so it spends the agent's subscription only by the Candidate's choice.
   */
  readonly fillInBackground: boolean;
  /**
   * The model and the reasoning level of each agent with a stored choice, by agent. Every new
   * session of the agent starts with them when the agent still offers them.
   */
  readonly agentModels: Readonly<Record<string, AgentModel>>;
}
