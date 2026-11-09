// The Inbox report as the API tests of spec #47 read it.
import type { FastifyInstance } from "fastify";
import { expect } from "vitest";

import { api } from "./setup-test-support.ts";

/** The Inbox report as the panel reads it. */
export interface ReportView {
  readonly id: string;
  readonly partial: boolean;
  readonly summary: string;
  readonly duplicates: number;
  readonly added: number;
  /** How many of the added Questions the Candidate has not seen. */
  readonly newQuestions: number;
  readonly sources: readonly { readonly id: string; readonly status: string }[];
  readonly sections: readonly {
    readonly id: string | null;
    readonly name: string;
    readonly topics: readonly {
      readonly id: string;
      readonly name: string;
      readonly questions: readonly {
        readonly id: string;
        readonly text: string;
        readonly hidden: boolean;
        readonly unseen: boolean;
        readonly unconfirmed: boolean;
        /** The material the Question came from and its part; null for a made-up Question. */
        readonly source: {
          readonly id: string;
          readonly title: string;
          readonly part: number | null;
        } | null;
        readonly referenceAnswer: {
          readonly points: readonly string[];
          readonly sample: string;
          readonly origin: string;
          readonly part: number | null;
        } | null;
      }[];
    }[];
  }[];
  readonly doubtful: readonly { readonly text: string; readonly reason: string }[];
  readonly proposals: {
    readonly sections: readonly { readonly name: string; readonly kind: string }[];
    readonly preferences: readonly { readonly text: string }[];
  };
}

export async function reportOf(
  server: FastifyInstance,
  targetId: string,
  reportId: string,
): Promise<ReportView> {
  const response = await api(server).get(`/api/targets/${targetId}/inbox-reports/${reportId}`);
  expect(response.statusCode).toBe(200);
  return response.json<ReportView>();
}
