import { goalSetupGraph } from "./goal-setup-graph.js";
import type { RunGoalSetup } from "../goals-and-scenarios/index.js";
import type { GoalSetupModel } from "./goal-setup-model.js";

export {
  GoalSetupModelError,
  ollamaGoalSetupModel,
  type GoalSetupModel,
} from "./goal-setup-model.js";

export function goalSetupAgent(model?: GoalSetupModel): RunGoalSetup {
  const graph = goalSetupGraph(model);
  return async (execution) => (await graph.invoke({ execution })).turn;
}

export function goalSetupMap() {
  return goalSetupGraph().getGraph().drawMermaid();
}
