/**
 * Runs a task repeatedly. Code takes it as a parameter, so tests tick it by hand instead of
 * sleeping. The returned function stops the ticks.
 */
export interface Timer {
  readonly repeat: (intervalMs: number, tick: () => Promise<void>) => () => void;
}
