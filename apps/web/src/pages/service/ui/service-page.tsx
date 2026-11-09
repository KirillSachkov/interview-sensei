import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { fetchHealth } from "@/shared/api";

import { ServiceChat } from "./service-chat";

/**
 * «Проверка агента»: server status and the service chat, where the Candidate checks that an agent
 * starts and answers. The top bar leads here; the link goes back to the canvas.
 */
export function ServicePage() {
  return (
    <>
      <header className="top-bar">
        <nav className="island top-island" aria-label="Навигация">
          <Link to="/" className="button ghost">
            ← К холсту
          </Link>
        </nav>
      </header>
      <main className="page">
        <h1>Проверка агента</h1>
        <ServerStatus />
        <ServiceChat />
      </main>
    </>
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
