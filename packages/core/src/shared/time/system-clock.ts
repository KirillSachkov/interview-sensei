import type { Clock } from "./clock.ts";

/** The real time. Only the server's entry point creates it; everything else receives a Clock. */
export const systemClock: Clock = { now: () => new Date() };
