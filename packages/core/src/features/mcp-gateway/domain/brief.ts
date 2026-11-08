/**
 * The brief of a session kind: what the agent does in this session. Session kinds of later slices
 * add their briefs here.
 */
export function briefFor(kind: string): string {
  switch (kind) {
    case "service-chat": {
      return [
        "This is the Interview Sensei service chat.",
        "The Candidate checks that the application reaches the agent: answer briefly in Russian.",
        "There is no interview here, so do not ask interview questions.",
      ].join(" ");
    }
    default: {
      return `No brief for the session kind ${kind}.`;
    }
  }
}
