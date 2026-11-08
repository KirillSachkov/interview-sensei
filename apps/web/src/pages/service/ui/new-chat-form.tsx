import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";

import { fetchAgents, startServiceChat } from "@/shared/api";

import { agentName } from "./agent-names";

/** Chooses an available agent and starts a new service chat with it. */
export function NewChatForm({ onStarted }: { onStarted: (sessionId: string) => void }) {
  const agents = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });
  if (agents.isError) {
    return <p role="alert">Не удалось получить список агентов: {agents.error.message}</p>;
  }
  const available = agents.data?.filter((agent) => agent.available).map(({ agent }) => agent);
  if (available?.length === 0) {
    return <p>Нет доступных агентов.</p>;
  }
  return <AgentForm available={available ?? []} onStarted={onStarted} />;
}

function AgentForm({
  available,
  onStarted,
}: {
  available: readonly string[];
  onStarted: (sessionId: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const agent = chosen ?? available[0] ?? null;
  const start = useMutation({
    mutationFn: startServiceChat,
    onSuccess: (session) => {
      onStarted(session.id);
    },
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (agent !== null) {
      start.mutate(agent);
    }
  };
  return (
    <form onSubmit={submit}>
      <label>
        Агент{" "}
        <select
          value={agent ?? ""}
          onChange={(event) => {
            setChosen(event.target.value);
          }}
        >
          {available.map((option) => (
            <option key={option} value={option}>
              {agentName(option)}
            </option>
          ))}
        </select>
      </label>{" "}
      <button type="submit" disabled={agent === null || start.isPending}>
        Новый чат
      </button>
      {start.isError ? <p role="alert">Чат не начался: {start.error.message}</p> : null}
    </form>
  );
}
