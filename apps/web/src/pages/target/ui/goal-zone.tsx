import type { TargetView } from "@/shared/api";

import { SourcesCard } from "./sources-card";
import { TargetCard } from "./target-card";
import { TargetPlan } from "./target-plan";

/**
 * The «Цель» zone: the Target's name and level, «Настроить цель», the Interview plan and the
 * materials.
 */
export function GoalZone({ target, onSetup }: { target: TargetView; onSetup: () => void }) {
  return (
    <>
      <TargetCard target={target} />
      <button type="button" onClick={onSetup}>
        Настроить цель
      </button>
      <TargetPlan target={target} />
      <SourcesCard targetId={target.id} />
    </>
  );
}
