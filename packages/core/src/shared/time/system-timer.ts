import type { Timer } from "./timer.ts";

/** Real timers. Only the server's entry point creates it; everything else receives a Timer. */
export const systemTimer: Timer = {
  every: (intervalMs, tick) => {
    const interval = setInterval(() => {
      void tick();
    }, intervalMs);
    // A pending tick must not keep the process alive after the server stops.
    interval.unref();
    return () => {
      clearInterval(interval);
    };
  },
};
