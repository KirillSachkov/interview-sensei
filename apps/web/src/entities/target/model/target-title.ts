import type { TargetSummary } from "@/shared/api";

/** The Target's name for the Candidate; a draft Target may have no name yet. */
export function targetTitle(target: TargetSummary): string {
  return target.name === "" ? "Цель без названия" : target.name;
}
