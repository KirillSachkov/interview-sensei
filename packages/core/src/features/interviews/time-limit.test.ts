// Unit tests of the time of a Mock interview with pauses (#84): only the time it ran counts. They
// sit at the slice root: domain-is-pure keeps even test imports such as vitest out of domain/.
import { describe, expect, it } from "vitest";

import type { MockInterview } from "./domain/interview.ts";
import {
  inOvertime,
  lastActivityAt,
  limitEndsAt,
  resumedTime,
  timeLeftMs,
} from "./domain/time-limit.ts";

const minute = 60_000;

/** A 30-minute Mock interview that started at 10:00 and ran without pauses. */
const interview = {
  status: "running",
  limitMinutes: 30,
  startedAt: "2026-03-01T10:00:00.000Z",
  pausedAt: null,
  pausedMs: 0,
} satisfies Partial<MockInterview>;

describe("time of a mock interview with pauses", () => {
  it("counts down from the start while it runs", () => {
    expect(timeLeftMs(interview, "2026-03-01T10:10:00.000Z")).toBe(20 * minute);
    expect(limitEndsAt(interview)).toBe("2026-03-01T10:30:00.000Z");
  });

  it("stands still on a pause", () => {
    const paused = {
      ...interview,
      status: "paused",
      pausedAt: "2026-03-01T10:12:00.000Z",
    } as const;

    expect(timeLeftMs(paused, "2026-03-01T10:40:00.000Z")).toBe(18 * minute);
    expect(limitEndsAt(paused)).toBeNull();
    expect(inOvertime(paused, "2026-03-01T11:00:00.000Z")).toBe(false);
  });

  it("goes on after the pause from where it stood", () => {
    const paused = {
      ...interview,
      status: "paused",
      pausedAt: "2026-03-01T10:12:00.000Z",
    } as const;

    const resumed = { ...interview, ...resumedTime(paused, "2026-03-01T10:52:00.000Z") };

    expect(resumed).toMatchObject({ pausedAt: null, pausedMs: 40 * minute });
    expect(timeLeftMs(resumed, "2026-03-01T10:52:00.000Z")).toBe(18 * minute);
    expect(limitEndsAt(resumed)).toBe("2026-03-01T11:10:00.000Z");
  });

  it("adds up several pauses", () => {
    const twice = { ...interview, pausedMs: 15 * minute };
    const paused = { ...twice, status: "paused", pausedAt: "2026-03-01T10:45:00.000Z" } as const;

    const resumed = { ...twice, ...resumedTime(paused, "2026-03-01T11:00:00.000Z") };

    expect(resumed.pausedMs).toBe(30 * minute);
    expect(timeLeftMs(resumed, "2026-03-01T11:00:00.000Z")).toBe(0);
    expect(inOvertime(resumed, "2026-03-01T11:00:00.000Z")).toBe(true);
  });

  it("has no time left without a limit", () => {
    expect(timeLeftMs({ ...interview, limitMinutes: null }, "2026-03-01T10:10:00.000Z")).toBeNull();
    expect(limitEndsAt({ ...interview, limitMinutes: null })).toBeNull();
  });
});

describe("pause after an unexpected server stop", () => {
  it("starts at the last moment the server recorded for the mock interview", () => {
    const asked = [
      {
        presentedAt: "2026-03-01T10:05:00.000Z",
        answer: { answeredAt: "2026-03-01T10:09:00.000Z" },
        followUps: [{ askedAt: "2026-03-01T10:07:00.000Z" }],
      },
    ];
    const attempts = [{ recordedAt: "2026-03-01T10:08:00.000Z" }];

    expect(lastActivityAt({ ...interview, resumedAt: null }, { asked, attempts })).toBe(
      "2026-03-01T10:09:00.000Z",
    );
  });

  it("starts at the start or the last continuation when nothing happened since", () => {
    expect(lastActivityAt({ ...interview, resumedAt: null }, { asked: [], attempts: [] })).toBe(
      interview.startedAt,
    );
    expect(
      lastActivityAt(
        { ...interview, resumedAt: "2026-03-01T10:20:00.000Z" },
        {
          asked: [{ presentedAt: "2026-03-01T10:05:00.000Z", answer: null, followUps: [] }],
          attempts: [],
        },
      ),
    ).toBe("2026-03-01T10:20:00.000Z");
  });
});
