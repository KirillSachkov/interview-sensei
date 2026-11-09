import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";

import { NewTargetButton } from "@/features/new-target";
import { TopBar } from "@/widgets/top-bar";
import { fetchTargets, openDemoTarget } from "@/shared/api";
import type { TargetSummary } from "@/shared/api";
import { lastTargetId } from "@/shared/lib";

/** The last opened Target when it still exists, otherwise the first one. */
function startTarget(targets: readonly TargetSummary[]): TargetSummary | undefined {
  const last = lastTargetId();
  return targets.find((target) => target.id === last) ?? targets[0];
}

/** The app's start: the canvas of the last Target, or the empty state without Targets. */
export function HomePage() {
  const targets = useQuery({ queryKey: ["targets"], queryFn: fetchTargets });
  if (targets.isError) {
    return (
      <main className="centered">
        <p role="alert">Не удалось получить цели: {targets.error.message}</p>
      </main>
    );
  }
  if (targets.data === undefined) {
    return null;
  }
  const target = startTarget(targets.data);
  return target === undefined ? (
    <EmptyState />
  ) : (
    <Navigate to="/targets/$targetId" params={{ targetId: target.id }} replace />
  );
}

function EmptyState() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const open = useMutation({
    mutationFn: openDemoTarget,
    onSuccess: async (target) => {
      await queryClient.invalidateQueries({ queryKey: ["targets"] });
      await navigate({ to: "/targets/$targetId", params: { targetId: target.id } });
    },
  });
  return (
    <>
      <TopBar target={null} />
      <main className="centered">
        <section className="island empty-state" aria-labelledby="empty-title">
          <h1 id="empty-title">Целей пока нет</h1>
          <p>
            Цель — это направление подготовки: вакансия, уровень и план собеседования. Создайте цель
            вместе с агентом или откройте демо-цель, чтобы посмотреть, как устроен холст.
          </p>
          <NewTargetButton big />
          <button
            type="button"
            className="ghost big"
            disabled={open.isPending}
            onClick={() => {
              open.mutate();
            }}
          >
            Открыть демо-цель
          </button>
          {open.isError ? <p role="alert">Демо-цель не открылась: {open.error.message}</p> : null}
        </section>
      </main>
    </>
  );
}
