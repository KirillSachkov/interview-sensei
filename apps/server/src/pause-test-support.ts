// Helpers of the pause API tests (#84): «Пауза» and «Продолжить» on the Mock interview API of
// interview-test-support.ts, and an agent of an earlier run that this server does not offer.
import { fastify } from "fastify";

import { browserHeaders, fixedTime, temporaryDirectory } from "./chat-test-support.ts";
import { composeFeatures } from "./composition.ts";
import { followInterview, hasQuestions } from "./interview-test-support.ts";
import type { Interview, interviewApi } from "./interview-test-support.ts";

type Api = Awaited<ReturnType<typeof interviewApi>>;

/** «Пауза», «Продолжить» and the stored view of the Mock interviews of the API's server. */
export function pauseApi(api: Api) {
  const { server } = api;
  const headers = browserHeaders(server);
  const post = async (url: string, payload: object = {}) =>
    server.inject({ method: "POST", url, headers, payload });
  /** «Продолжить», with the agent to go on with when the Candidate chose one. */
  const resume = async (id: string, payload: object = {}) =>
    post(`/api/interviews/${id}/resume`, payload);
  return {
    pause: async (id: string) =>
      server.inject({ method: "POST", url: `/api/interviews/${id}/pause`, headers }),
    resume,
    /** «Продолжить»: resolves with the view of the running Mock interview; throws on a refusal. */
    resumed: async (id: string, payload: object = {}): Promise<Interview> => {
      const response = await resume(id, payload);
      if (response.statusCode !== 200) {
        throw new Error(`The continuation failed: ${response.statusCode} ${response.body}`);
      }
      return response.json<Interview>();
    },
    /** The Mock interview as the server reads it now. */
    stored: async (id: string): Promise<Interview> => {
      const response = await api.get(`/api/interviews/${id}`);
      return response.json<Interview>();
    },
    /** Follows the Mock interview's socket, such as after a restart. */
    follow: async (id: string) => followInterview(server, id),
  };
}

export const hasStatus = (status: string) => (view: Interview) => view.status === status;

/** Starts on «Опыт и резюме» with the settings and waits for the first question. */
export async function shownFirst(api: Api, settings: { limitMinutes?: number } = {}) {
  const run = await api.started(["Опыт и резюме"], settings);
  await run.events.waitFor(hasQuestions(1));
  return run;
}

/** Runs SQL on the data directory of a stopped server, as an earlier run could have left it. */
export async function storeWith(dataDirectory: string, statements: readonly string[]) {
  const features = await composeFeatures({
    dataDirectory,
    skillsDirectory: await temporaryDirectory(),
    clock: { now: () => new Date(fixedTime) },
    timer: { repeat: () => () => {}, after: () => () => {} },
    fakeAgent: true,
    userEnvironment: undefined,
    origin: () => "http://127.0.0.1:4399",
    log: fastify().log,
  });
  try {
    for (const statement of statements) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the statements run in order
      await features.storage.database.execute(statement);
    }
  } finally {
    await features.sessions.close();
    await features.storage.close();
  }
}

/**
 * Stores another agent for the Mock interview, as if an earlier run had started it with an agent
 * this server does not offer, such as Codex on a server with the fake agent. A test cannot start a
 * Mock interview with a real agent: it needs a subscription.
 */
export async function storeAgent(
  dataDirectory: string,
  { interviewId, agent }: { interviewId: string; agent: string },
) {
  await storeWith(dataDirectory, [
    `update interviews.interviews set agent = '${agent}' where id = '${interviewId}'`,
  ]);
}
