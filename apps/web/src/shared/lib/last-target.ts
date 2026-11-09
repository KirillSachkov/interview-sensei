// The browser keeps the id of the last opened Target, so the app opens on its canvas again.
const key = "interview-sensei:last-target";

/** The id of the Target the Candidate opened last in this browser, if any. */
export function lastTargetId(): string | null {
  return globalThis.localStorage.getItem(key);
}

export function rememberTarget(id: string): void {
  globalThis.localStorage.setItem(key, id);
}
