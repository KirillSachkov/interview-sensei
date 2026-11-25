export { goalSetups, GoalSetupConflict } from "./goal-setup.js";
export type {
  GoalSetup,
  GoalSetupExecution,
  GoalSetupInterpretation,
  GoalSetupTurn,
  RunGoalSetup,
  StoredGoalSetupTurn,
} from "./goal-setup.js";

export function openWorkspace(
  current: string | undefined,
  createWorkspace: () => Promise<string>,
): Promise<string> {
  return current === undefined ? createWorkspace() : Promise.resolve(current);
}
