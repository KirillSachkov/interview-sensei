import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { agentName } from "@/entities/agent";
import {
  chooseDefaultAgent,
  fetchAgents,
  fetchSettings,
  setFillInBackground,
} from "@/shared/api";

import { Menu, MenuCheckbox, MenuChoice } from "./menu";

/** The settings of the whole app, not of one Target. */
export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
}

/** The default agent's choices: the first available agent, then each agent. */
function DefaultAgentChoices({
  current,
  onChoose,
}: {
  current: string | null;
  onChoose: (agent: string | null) => void;
}) {
  const agents = useQuery({ queryKey: ["agents"], queryFn: fetchAgents });
  return (
    <>
      <p className="menu-heading">Агент по умолчанию</p>
      <MenuChoice
        checked={current === null}
        onChoose={() => {
          onChoose(null);
        }}
      >
        <span>Первый доступный</span>
        <span className="hint">как найдёт приложение</span>
      </MenuChoice>
      {(agents.data ?? []).map((option) => (
        <MenuChoice
          key={option.agent}
          checked={option.agent === current}
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
 * «Наполнять в фоне», off by default: with it on, the answer search fills up to 20 Questions by
 * itself after an Inbox processing and after a mock, and spends the agent's subscription.
 */
function FillInBackground({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <>
      <p className="menu-heading">Опорные ответы</p>
      <MenuCheckbox checked={on} onToggle={onToggle}>
        <span>Наполнять в фоне</span>
        <span className="hint">
          до 20 вопросов после разбора и мока; расходует лимиты подписки агента
        </span>
      </MenuCheckbox>
    </>
  );
}

/**
 * «Настройки»: the default agent of every Target without its own agent, and «Наполнять в фоне».
 * Without the default agent a Target takes the first available agent.
 */
export function SettingsMenu() {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const fill = useMutation({
    mutationFn: setFillInBackground,
    onSuccess: (saved) => {
      queryClient.setQueryData(["settings"], saved);
    },
  });
  const choose = useMutation({
    mutationFn: chooseDefaultAgent,
    onSuccess: async (saved) => {
      queryClient.setQueryData(["settings"], saved);
      // A Target without its own agent now shows the new default agent.
      await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[2] === "agent" });
    },
  });
  return (
    <>
      <Menu label="Настройки" button="Настройки">
        {(close) => (
          <>
            <DefaultAgentChoices
              current={settings.data?.defaultAgent ?? null}
              onChoose={(agent) => {
                close();
                choose.mutate(agent);
              }}
            />
            <FillInBackground
              on={settings.data?.fillInBackground ?? false}
              onToggle={() => {
                fill.mutate(!(settings.data?.fillInBackground ?? false));
              }}
            />
          </>
        )}
      </Menu>
      {choose.isError ? <p role="alert">Настройка не сохранена: {choose.error.message}</p> : null}
      {fill.isError ? <p role="alert">Настройка не сохранена: {fill.error.message}</p> : null}
    </>
  );
}
