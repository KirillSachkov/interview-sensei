/** The source of the current time. Code takes it as a parameter, so tests can fix the time. */
export interface Clock {
  readonly now: () => Date;
}
