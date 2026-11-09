import type { TargetView } from "@/shared/api";

import { TargetCard } from "./target-card";
import { TargetPlan } from "./target-plan";

/** The «Цель» zone: the Target's name and level, «Настроить цель» and the Interview plan. */
export function GoalZone({ target, onSetup }: { target: TargetView; onSetup: () => void }) {
  return (
    <>
      <TargetCard target={target} />
      <button type="button" onClick={onSetup}>
        Настроить цель
      </button>
      <TargetPlan target={target} />
    </>
  );
}
