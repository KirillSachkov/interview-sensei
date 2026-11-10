import { useQuery } from "@tanstack/react-query";

import { OptionPills } from "@/features/agent-chat";
import type { OptionChange } from "@/features/agent-chat";
import { fetchAgentOptions, fetchSettings, fetchTargetAgent } from "@/shared/api";
import type { AgentOptions } from "@/shared/api";

type Choice = AgentOptions["model"];

/** The list with the value as the current one, when the list offers it. */
function withCurrent(own: Choice, value: string | undefined): Choice {
  return own === null || value === undefined || !own.values.some((option) => option.value === value)
    ? own
    : { ...own, current: value };
}

/** The agent's lists with the Candidate's choice as the current values. */
function chosen(options: AgentOptions, choice: OptionChange): AgentOptions {
  return {
    model: withCurrent(options.model, choice.model),
    effort: withCurrent(options.effort, choice.effort),
  };
}

/**
 * The model and the reasoning level of the session that the first message starts. They begin as
 * the defaults of the Target's agent from «Настройки», or the agent's own; the server reads the
 * lists from the agent without a prompt. `choice` holds what the Candidate changed here.
 */
export function WaitingOptions({
  targetId,
  choice,
  onChange,
}: {
  targetId: string;
  choice: OptionChange;
  onChange: (choice: OptionChange) => void;
}) {
  const agent = useQuery({
    queryKey: ["targets", targetId, "agent"],
    queryFn: async () => fetchTargetAgent(targetId),
  });
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const name = agent.data?.agent ?? null;
  const preset = name === null ? undefined : settings.data?.agentModels[name];
  const model = choice.model ?? preset?.model ?? null;
  const options = useQuery({
    queryKey: ["agent-options", name, model],
    queryFn: async () => fetchAgentOptions(name ?? "", { model }),
    enabled: name !== null && settings.data !== undefined,
    staleTime: Infinity,
    retry: false,
  });
  if (options.data === undefined) {
    return null;
  }
  const effort =
    choice.effort ?? (choice.model === undefined ? (preset?.effort ?? undefined) : undefined);
  return (
    <OptionPills
      options={chosen(options.data, {
        ...(model === null ? {} : { model }),
        ...(effort === undefined ? {} : { effort }),
      })}
      disabled={false}
      onChange={(change) => {
        // The levels belong to the model: a new model starts from its own level.
        onChange(change.model === undefined ? { ...choice, ...change } : { model: change.model });
      }}
    />
  );
}
