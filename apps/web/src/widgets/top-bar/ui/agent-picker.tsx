import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { agentName } from "@/entities/agent";
import { chooseTargetAgent, fetchAgents, fetchTargetAgent } from "@/shared/api";
import type { TargetAgent } from "@/shared/api";

import { Menu, MenuChoice } from "./menu";
import { useSettings } from "./settings-menu";

function CurrentAgent({ current: { agent, chosen } }: { current: TargetAgent }) {
  return (
    <span className="agent-current">
      <span className="muted">Агент:</span> {agent === null ? "нет доступных" : agentName(agent)}
      {chosen ? null : <span className="tag">по умолчанию</span>}
    </span>
  );
}

/** The menu's choices: the default agent, then each agent with its availability. */
function AgentChoices({
  current,
  onChoose,
}: {
  current: TargetAgent;
  onChoose: (agent: string | null) => void;
}) {
  const agents = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });
  const preset = useSettings().data?.defaultAgent ?? null;
  return (
    <>
      <MenuChoice
        checked={!current.chosen}
        onChoose={() => {
          onChoose(null);
        }}
      >
        <span>По умолчанию</span>
        <span className="hint">
          {preset === null ? "первый доступный агент" : `${agentName(preset)}, из «Настроек»`}
        </span>
      </MenuChoice>
      {(agents.data ?? []).map((option) => (
        <MenuChoice
          key={option.agent}
          checked={current.chosen && option.agent === current.agent}
          disabled={!option.available}
          onChoose={() => {
            onChoose(option.agent);
          }}
        >
          <span>{agentName(option.agent)}</span>
          <span className="hint">
            <span aria-hidden="true" className={option.available ? "dot dot-ok" : "dot dot-off"} />
            {option.available ? "доступен" : option.reason}
          </span>
        </MenuChoice>
      ))}
    </>
  );
}

/**
 * The Target's agent. The menu shows whether each agent is available and stores the choice;
 * «По умолчанию» returns the Target to the default agent of «Настройки», or to the first
 * available one.
 */
export function AgentPicker({ targetId }: { targetId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["targets", targetId, "agent"];
  const current = useQuery({ queryKey, queryFn: async () => fetchTargetAgent(targetId) });
  const choose = useMutation({
    mutationFn: async (agent: string | null) => chooseTargetAgent(targetId, agent),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKey, saved);
    },
  });
  if (current.isError) {
    return <p role="alert">Агент цели не загрузился: {current.error.message}</p>;
  }
  if (current.data === undefined) {
    return null;
  }
  return (
    <>
      <Menu label="Агент цели" button={<CurrentAgent current={current.data} />}>
        {(close) => (
          <AgentChoices
            current={current.data}
            onChoose={(agent) => {
              close();
              choose.mutate(agent);
            }}
          />
        )}
      </Menu>
      {choose.isError ? <p role="alert">Агент не сохранён: {choose.error.message}</p> : null}
    </>
  );
}
