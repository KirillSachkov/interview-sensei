import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { agentName } from "@/entities/agent";
import { chooseTargetAgent, fetchAgents, fetchTargetAgent } from "@/shared/api";

/** The value of «по умолчанию» in the list: the default agent of «Настройки». */
const byDefault = "";

/**
 * The Target's agent as a list in the message box of the setup chat, before a session starts. The
 * choice holds for the Target's new sessions, the Mock interviews among them; «по умолчанию»
 * returns to the default agent of «Настройки», or to the first available one. An unavailable
 * agent stays in the list and cannot be chosen.
 */
export function AgentSelect({ targetId }: { targetId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["targets", targetId, "agent"];
  const current = useQuery({ queryKey, queryFn: async () => fetchTargetAgent(targetId) });
  const agents = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });
  const choose = useMutation({
    mutationFn: async (agent: string | null) => chooseTargetAgent(targetId, agent),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
    },
  });
  if (current.data === undefined) {
    return null;
  }
  const { agent, chosen } = current.data;
  return (
    <>
      <label className="option-pill">
        <span>Агент</span>
        <select
          aria-label="Агент"
          value={chosen && agent !== null ? agent : byDefault}
          disabled={choose.isPending}
          onChange={(event) => {
            choose.mutate(event.target.value === byDefault ? null : event.target.value);
          }}
        >
          <option value={byDefault}>
            {chosen || agent === null ? "по умолчанию" : `${agentName(agent)}, по умолчанию`}
          </option>
          {(agents.data ?? []).map((option) => (
            <option key={option.agent} value={option.agent} disabled={!option.available}>
              {agentName(option.agent)}
              {option.available ? "" : " (недоступен)"}
            </option>
          ))}
        </select>
      </label>
      {choose.isError ? <span role="alert">Агент не сохранён: {choose.error.message}</span> : null}
    </>
  );
}
