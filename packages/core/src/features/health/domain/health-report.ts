/** The server's answer to a health check: it is up and answered at `checkedAt` (ISO 8601). */
export interface HealthReport {
  readonly status: "ok";
  readonly checkedAt: string;
}

export function healthyAt(moment: Date): HealthReport {
  return { status: "ok", checkedAt: moment.toISOString() };
}
