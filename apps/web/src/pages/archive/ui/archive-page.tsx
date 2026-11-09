import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import { targetTitle } from "@/entities/target";
import { BackToCanvasBar } from "@/widgets/top-bar";
import { deleteTarget, fetchArchivedTargets, restoreTarget } from "@/shared/api";
import type { TargetSummary } from "@/shared/api";

/** The Target list and the archive change together. */
async function invalidateTargets(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["targets"], exact: true }),
    queryClient.invalidateQueries({ queryKey: ["targets", "archived"] }),
  ]);
}

/** Asks for the Target's exact name before it is deleted for good with all its data. */
function DeleteForm({ target, onCancel }: { target: TargetSummary; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: async () => deleteTarget(target.id, typed),
    onSuccess: async () => {
      await invalidateTargets(queryClient);
    },
  });
  return (
    <form
      className="delete-form"
      aria-label={`Удаление цели «${target.name}»`}
      onSubmit={(event) => {
        event.preventDefault();
        remove.mutate();
      }}
    >
      <label htmlFor={inputId}>
        Удаление сотрёт материалы, вопросы, попытки и сессии цели. Это нельзя отменить. Введите
        название цели, чтобы подтвердить: <strong>{target.name}</strong>
      </label>
      <input
        id={inputId}
        value={typed}
        autoComplete="off"
        onChange={(event) => {
          setTyped(event.target.value);
        }}
      />
      <div className="dialog-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Отмена
        </button>
        <button
          type="submit"
          className="danger"
          disabled={typed.trim() !== target.name.trim() || remove.isPending}
        >
          Удалить навсегда
        </button>
      </div>
      {remove.isError ? <p role="alert">Цель не удалена: {remove.error.message}</p> : null}
    </form>
  );
}

/** One archived Target: «Вернуть» or «Удалить навсегда». */
function ArchivedTarget({ target }: { target: TargetSummary }) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const restore = useMutation({
    mutationFn: async () => restoreTarget(target.id),
    onSuccess: async () => {
      await invalidateTargets(queryClient);
    },
  });
  return (
    <li className="archive-item" aria-label={targetTitle(target)}>
      <div className="archive-head">
        <span className="archive-name">{targetTitle(target)}</span>
        <button
          type="button"
          disabled={restore.isPending}
          onClick={() => {
            restore.mutate();
          }}
        >
          Вернуть
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setDeleting(true);
          }}
        >
          Удалить навсегда
        </button>
      </div>
      {restore.isError ? <p role="alert">Цель не вернулась: {restore.error.message}</p> : null}
      {deleting ? (
        <DeleteForm
          target={target}
          onCancel={() => {
            setDeleting(false);
          }}
        />
      ) : null}
    </li>
  );
}

/** «Архив»: the archived Targets, which the Candidate restores or deletes for good. */
export function ArchivePage() {
  const archived = useQuery({
    queryKey: ["targets", "archived"],
    queryFn: fetchArchivedTargets,
  });
  return (
    <>
      <BackToCanvasBar />
      <main className="page">
        <section className="island archive" aria-labelledby="archive-title">
          <h1 id="archive-title">Архив</h1>
          {archived.isError ? (
            <p role="alert">Архив не загрузился: {archived.error.message}</p>
          ) : null}
          {archived.data?.length === 0 ? <p className="muted">В архиве нет целей.</p> : null}
          <ul className="archive-list" aria-label="Архивные цели">
            {(archived.data ?? []).map((target) => (
              <ArchivedTarget key={target.id} target={target} />
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
