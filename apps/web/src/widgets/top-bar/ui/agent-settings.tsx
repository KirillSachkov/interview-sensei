import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { agentName } from "@/entities/agent";
import { chooseDefaultAgent, fetchAgentOptions, fetchAgents, setAgentModel } from "@/shared/api";
import type { AgentAvailability, AgentModelChoice, AppSettings, OptionChoice } from "@/shared/api";

/** The value of «как у агента» in a select: the agent's own default. */
const agentsOwn = "";

/** One select of an agent's default: «как у агента» and the values the agent offers. */
function DefaultSelect({
  label,
  choice,
  value,
  disabled,
  onChange,
}: {
  label: string;
  choice: OptionChoice;
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  // A stored value the agent no longer offers stays in the list, so the select shows it.
  const stale = value !== null && !choice.values.some((option) => option.value === value);
  return (
    <label className="agent-option">
      <span className="muted">{label}</span>
      <select
        value={value ?? agentsOwn}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value === agentsOwn ? null : event.target.value);
        }}
      >
        <option value={agentsOwn}>как у агента</option>
        {stale ? <option value={value}>{value} (агент больше не предлагает)</option> : null}
        {choice.values.map((option) => (
          <option key={option.value} value={option.value}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Stores the agent's default model and level and shows the stored settings at once. */
function useSaveModel(agent: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (choice: AgentModelChoice) => setAgentModel(agent, choice),
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings"], saved);
    },
  });
}

/**
 * The default model and reasoning level of an available agent. The server reads the lists from
 * the agent itself, without a prompt, so they cost no subscription; the levels follow the model.
 */
function AgentModels({ agent, stored }: { agent: string; stored: AgentModelChoice }) {
  const options = useQuery({
    queryKey: ["agent-options", agent, stored.model],
    queryFn: async () => fetchAgentOptions(agent, { model: stored.model }),
    staleTime: Infinity,
    retry: false,
  });
  const save = useSaveModel(agent);
  if (options.isError) {
    return <p role="alert">Модели не загрузились: {options.error.message}</p>;
  }
  if (options.data === undefined) {
    return <p className="muted">Спрашиваем у агента список моделей…</p>;
  }
  const { model, effort } = options.data;
  return (
    <div className="agent-options">
      {model === null ? (
        <p className="muted">Агент не предлагает выбор модели.</p>
      ) : (
        <DefaultSelect
          label="Модель"
          choice={model}
          value={stored.model}
          disabled={save.isPending}
          onChange={(value) => {
            // The levels belong to the model: a new model starts from its own level.
            save.mutate({ model: value, effort: null });
          }}
        />
      )}
      {effort === null ? null : (
        <DefaultSelect
          label="Уровень мышления"
          choice={effort}
          value={stored.effort}
          disabled={save.isPending}
          onChange={(value) => {
            save.mutate({ model: stored.model, effort: value });
          }}
        />
      )}
      {save.isError ? <p role="alert">Настройка не сохранена: {save.error.message}</p> : null}
    </div>
  );
}

/** One agent: whether it is available and why not, the default mark and its default model. */
function AgentRow({
  option,
  settings,
  onDefault,
}: {
  option: AgentAvailability;
  settings: AppSettings;
  onDefault: (agent: string) => void;
}) {
  const isDefault = settings.defaultAgent === option.agent;
  return (
    <li className="card agent-row">
      <div className="agent-row-head">
        <span className="agent-row-name">
          <span aria-hidden="true" className={option.available ? "dot dot-ok" : "dot dot-off"} />
          <strong>{agentName(option.agent)}</strong>
          <span className="muted">{option.available ? "доступен" : "недоступен"}</span>
        </span>
        <label className="agent-default">
          <input
            type="radio"
            name="default-agent"
            checked={isDefault}
            onChange={() => {
              onDefault(option.agent);
            }}
          />
          по умолчанию
        </label>
      </div>
      {option.available ? (
        <AgentModels
          agent={option.agent}
          stored={settings.agentModels[option.agent] ?? { model: null, effort: null }}
        />
      ) : (
        <p className="muted">{option.reason}</p>
      )}
    </li>
  );
}

/** Stores the default agent; a Target without its own agent then shows the new one. */
function useDefaultAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: chooseDefaultAgent,
    onSuccess: async (saved) => {
      queryClient.setQueryData(["settings"], saved);
      await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[2] === "agent" });
    },
  });
}

/**
 * «Агенты» in «Настройки»: which agents the application found and why one is unavailable, the
 * default agent of Targets without their own, and each agent's default model and reasoning level.
 */
export function AgentSettings({ settings }: { settings: AppSettings }) {
  const agents = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });
  const choose = useDefaultAgent();
  return (
    <div className="agent-settings">
      <p className="muted">
        Приложение работает через ваших агентов. Агент по умолчанию ведёт цели, у которых нет своего
        агента. Модель и уровень мышления действуют на новые сессии; в чате их можно сменить.
      </p>
      <label className="agent-default">
        <input
          type="radio"
          name="default-agent"
          checked={settings.defaultAgent === null}
          onChange={() => {
            choose.mutate(null);
          }}
        />
        Первый доступный агент по умолчанию
      </label>
      {agents.isError ? <p role="alert">Агенты не загрузились: {agents.error.message}</p> : null}
      <ul className="agent-rows" aria-label="Агенты">
        {(agents.data ?? []).map((option) => (
          <AgentRow
            key={option.agent}
            option={option}
            settings={settings}
            onDefault={(agent) => {
              choose.mutate(agent);
            }}
          />
        ))}
      </ul>
      {choose.isError ? <p role="alert">Настройка не сохранена: {choose.error.message}</p> : null}
    </div>
  );
}
