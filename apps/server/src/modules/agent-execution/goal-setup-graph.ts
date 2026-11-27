import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type {
  GoalSetupExecution,
  GoalSetupTurn,
} from "../goals-and-scenarios/index.js";
import {
  GoalSetupModelError,
  instruction,
  interpretGoalSetupReply,
  type GoalSetupModel,
} from "./goal-setup-model.js";

const State = Annotation.Root({
  execution: Annotation<GoalSetupExecution>(),
  context: Annotation<Awaited<ReturnType<GoalSetupExecution["load"]>>>(),
  decision: Annotation<NonNullable<ReturnType<GoalSetupExecution["decide"]>>>(),
  path: Annotation<string[]>(),
  turn: Annotation<GoalSetupTurn>(),
});

export function goalSetupGraph(model?: GoalSetupModel) {
  const loadContext = "load_context";
  const interpretMessage = "interpret_message";
  const continueConversation = "continue_conversation";
  const showProposal = "show_proposal";

  const save =
    (node: string) =>
    async ({ execution, decision, path }: typeof State.State) => ({
      turn: await execution.save(decision, [...path, node]),
    });

  return new StateGraph(State)
    .addNode(loadContext, async ({ execution }) => ({
      context: await execution.load(),
      path: [loadContext],
    }))
    .addNode(interpretMessage, async ({ execution, context, path }) => {
      if (!model)
        throw new GoalSetupModelError("Модель настройки цели не настроена.");
      let interpretation;
      try {
        const { draft, history } = context;
        interpretation = interpretGoalSetupReply(
          await model(instruction, {
            draft,
            history,
            message: execution.message,
          }),
          execution.message,
        );
      } catch (error) {
        throw new GoalSetupModelError(
          "Модель не вернула ответ для настройки цели.",
          { cause: error },
        );
      }
      const decision = execution.decide(context, interpretation);
      if (!decision)
        throw new GoalSetupModelError(
          "Ответ модели не согласуется с черновиком.",
        );
      return { decision, path: [...path, interpretMessage] };
    })
    .addNode(continueConversation, save(continueConversation))
    .addNode(showProposal, save(showProposal))
    .addEdge(START, loadContext)
    .addEdge(loadContext, interpretMessage)
    .addConditionalEdges(
      interpretMessage,
      ({ decision }) =>
        decision.kind === "new_proposal" ? showProposal : continueConversation,
      [continueConversation, showProposal],
    )
    .addEdge(continueConversation, END)
    .addEdge(showProposal, END)
    .compile();
}
