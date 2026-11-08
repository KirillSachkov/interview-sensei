/**
 * Runs tasks later. Code takes it as a parameter, so tests run the tasks by hand instead of
 * sleeping.
 */
export interface Timer {
  /** Runs the tick at each interval; the returned function stops the ticks. */
  readonly repeat: (intervalMs: number, tick: () => Promise<void>) => () => void;
  /** Runs the task once after the delay; the returned function cancels it. */
  readonly after: (delayMs: number, task: () => void) => () => void;
}
