import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { SubmitEvent } from "react";

import { fetchAgents, fetchSessions, startServiceChat } from "@/shared/api";
import type { AgentAvailability } from "@/shared/api";

import { agentName } from "@/entities/agent";

/** Chooses an available agent and starts a new service chat with it. */
export function NewChatForm({ onStarted }: { onStarted: (sessionId: string) => void }) {
  const agents = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });
  if (agents.isError) {
    return <p role="alert">Не удалось получить список агентов: {agents.error.message}</p>;
  }
  if (agents.data === undefined) {
    return null;
  }
  return (
    <>
      {agents.data.some((agent) => agent.available) ? (
        <AgentForm agents={agents.data} onStarted={onStarted} />
      ) : (
        <p>Нет доступных агентов.</p>
      )}
      <UnavailableAgents agents={agents.data} />
    </>
  );
}

/** Why each unavailable agent cannot be chosen and what the Candidate can do about it. */
function UnavailableAgents({ agents }: { agents: readonly AgentAvailability[] }) {
  const unavailable = agents.flatMap((agent) => (agent.available ? [] : [agent]));
  if (unavailable.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Недоступные агенты">
      {unavailable.map(({ agent, reason }) => (
        <li key={agent}>
          {agentName(agent)}: {reason}
        </li>
      ))}
    </ul>
  );
}

/**
 * The Agent SDK warning before the first chat with Claude Code. The Candidate confirms it once:
 * after a Claude Code chat exists, the form starts the next one at once.
 */
function useClaudeWarning(agent: string | null) {
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: fetchSessions });
  const [confirmed, setConfirmed] = useState(false);
  const claudeUsed = sessions.data?.some((session) => session.agent === "claude") ?? false;
  const shown = agent === "claude" && !claudeUsed;
  return { shown, confirmed, setConfirmed, blocks: shown && !confirmed };
}

function ClaudeWarning({
  confirmed,
  onConfirm,
}: {
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
}) {
  return (
    <div role="note" aria-label="Предупреждение о кредитах Agent SDK">
      <p>
        Приложение запускает Claude Code через Agent SDK. По подписке Claude такое использование
        списывается из отдельных кредитов Agent SDK.
      </p>
      <label>
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => {
            onConfirm(event.target.checked);
          }}
        />{" "}
        Понятно, использовать кредиты Agent SDK
      </label>
    </div>
  );
}

/**
 * The OpenCode 2.x limit of #69: a session gets the Candidate's API keys, never a subscription
 * login, whose refresh token rotates.
 */
function OpencodeLoginNote() {
  return (
    <p role="note" aria-label="Вход в OpenCode">
      OpenCode 2.x работает в приложении только со входом по API-ключу, например DeepSeek. Вход по
      подписке (OAuth) приложение не передаёт агенту: копия его токена разлогинила бы ваш OpenCode.
      Если вы вошли по подписке, войдите в провайдера по API-ключу командой{" "}
      <code>opencode auth login</code> и начните новый чат.
    </p>
  );
}

function AgentSelect({
  agents,
  agent,
  onChoose,
}: {
  agents: readonly AgentAvailability[];
  agent: string | null;
  onChoose: (agent: string) => void;
}) {
  return (
    <label>
      Агент{" "}
      <select
        value={agent ?? ""}
        onChange={(event) => {
          onChoose(event.target.value);
        }}
      >
        {agents.map((option) => (
          <option key={option.agent} value={option.agent} disabled={!option.available}>
            {option.available ? agentName(option.agent) : `${agentName(option.agent)} — недоступен`}
          </option>
        ))}
      </select>
    </label>
  );
}

function AgentForm({
  agents,
  onStarted,
}: {
  agents: readonly AgentAvailability[];
  onStarted: (sessionId: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const agent = chosen ?? agents.find((option) => option.available)?.agent ?? null;
  const warning = useClaudeWarning(agent);
  const start = useMutation({
    mutationFn: startServiceChat,
    onSuccess: (session) => {
      onStarted(session.id);
    },
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (agent !== null && !warning.blocks) {
      start.mutate(agent);
    }
  };
  return (
    <form onSubmit={submit}>
      <AgentSelect agents={agents} agent={agent} onChoose={setChosen} />{" "}
      <button type="submit" disabled={agent === null || warning.blocks || start.isPending}>
        Новый чат
      </button>
      {warning.shown ? (
        <ClaudeWarning
          confirmed={warning.confirmed}
          onConfirm={(confirmed) => {
            warning.setConfirmed(confirmed);
          }}
        />
      ) : null}
      {agent === "opencode" ? <OpencodeLoginNote /> : null}
      {start.isError ? <p role="alert">Чат не начался: {start.error.message}</p> : null}
    </form>
  );
}
