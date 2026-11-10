/**
 * The Russian message of a start refused with `agent_unavailable`: no agent is available, or the
 * Target's agent cannot run now, with its reason and the way to choose another one.
 */
export function agentUnavailableMessage(reason: string | null): string {
  return reason === null
    ? "Нет доступного агента. Выберите агента в меню «Агент» в верхней панели."
    : `Агент цели недоступен. ${reason} Или выберите другого агента в меню «Агент» в верхней панели.`;
}
