import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { agentName } from "@/entities/agent";
import { chooseDefaultAgent, fetchAgents, fetchSettings } from "@/shared/api";

import { Menu, MenuChoice, MenuItem } from "./menu";
import { SpeechRecognitionDialog } from "./speech-recognition";

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
 * «Настройки»: the default agent of every Target without its own agent, and «Распознавание речи».
 * Without the default agent a Target takes the first available agent.
 */
export function SettingsMenu() {
  const [recognition, setRecognition] = useState(false);
  const queryClient = useQueryClient();
  const settings = useSettings();
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
            <p className="menu-heading">Видео и аудио</p>
            <MenuItem
              hint="модели, установка и удаление"
              onChoose={() => {
                close();
                setRecognition(true);
              }}
            >
              Распознавание речи
            </MenuItem>
          </>
        )}
      </Menu>
      {recognition ? (
        <SpeechRecognitionDialog
          onClose={() => {
            setRecognition(false);
          }}
        />
      ) : null}
      {choose.isError ? <p role="alert">Настройка не сохранена: {choose.error.message}</p> : null}
    </>
  );
}
