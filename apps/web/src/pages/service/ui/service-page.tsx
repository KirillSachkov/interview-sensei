import { useQuery } from "@tanstack/react-query";

import { fetchHealth } from "@/shared/api";

/** The service screen of the skeleton. Later tickets add the agent chat here. */
export function ServicePage() {
  return (
    <main>
      <h1>Interview Sensei</h1>
      <ServerStatus />
    </main>
  );
}

function ServerStatus() {
  // A diagnostic line: show a failure at once instead of retrying, and keep polling.
  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 5000,
    retry: false,
  });

  if (health.isPending) {
    return <output>Проверяем сервер…</output>;
  }
  if (health.isError) {
    return <p role="alert">Сервер недоступен: {health.error.message}</p>;
  }
  return <output>Сервер доступен</output>;
}
