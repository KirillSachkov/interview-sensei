import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  applyDraft,
  discardDraft,
  DraftProblemsError,
  fetchDraft,
  removeDraftChange,
} from "@/shared/api";
import type { SessionView } from "@/shared/api";

import { changeText } from "../lib/change-text";

function failureText(error: Error): string {
  return error instanceof DraftProblemsError
    ? `Черновик не применён: ${error.problems.join(" ")}`
    : `Черновик не применён: ${error.message}`;
}

/** The Target's draft of changes, which the Target page and the setup chat share. */
export function useDraft(targetId: string) {
  return useQuery({
    queryKey: ["targets", targetId, "draft"],
    queryFn: async () => fetchDraft(targetId),
  });
}

/** ✕ and «Отменить изменения»: they take changes out of the draft and reload it. */
function useDraftRemoval(targetId: string) {
  const queryClient = useQueryClient();
  const reload = async () =>
    queryClient.invalidateQueries({ queryKey: ["targets", targetId, "draft"] });
  const remove = useMutation({
    mutationFn: async (changeId: string) => removeDraftChange(targetId, changeId),
    onSettled: reload,
  });
  const discard = useMutation({
    mutationFn: async () => discardDraft(targetId),
    onSettled: reload,
  });
  return { remove, discard };
}

function useDraftApply(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => applyDraft(targetId),
    onSuccess: async (target) => {
      queryClient.setQueryData(["targets", targetId], target);
      queryClient.setQueryData(["targets", targetId, "draft"], []);
      await queryClient.invalidateQueries({ queryKey: ["targets"], exact: true });
    },
  });
}

/** Why the last action on the draft failed, for the Candidate. */
function DraftFailure({ applying, removing }: { applying: Error | null; removing: Error | null }) {
  if (applying !== null) {
    return <p role="alert">{failureText(applying)}</p>;
  }
  return removing === null ? null : <p role="alert">Черновик не изменился: {removing.message}</p>;
}

type Draft = ReturnType<typeof useDraft>;

/** The changes in the order of recording, each with ✕. */
function ChangeList({
  changes,
  disabled,
  onRemove,
}: {
  changes: NonNullable<Draft["data"]>;
  disabled: boolean;
  onRemove: (changeId: string) => void;
}) {
  return (
    <ol aria-label="Изменения черновика">
      {changes.map((change) => (
        <li key={change.id}>
          <span>{changeText(change.operation)}</span>
          <button
            type="button"
            className="ghost"
            aria-label={`Убрать изменение: ${changeText(change.operation)}`}
            disabled={disabled}
            onClick={() => {
              onRemove(change.id);
            }}
          >
            ✕
          </button>
        </li>
      ))}
    </ol>
  );
}

/** Reloads the draft whenever the agent ends a turn: its tools change the draft during the turn. */
function useDraftAfterTurn(targetId: string, status: SessionView["status"]) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (status === "idle") {
      void queryClient.invalidateQueries({ queryKey: ["targets", targetId, "draft"] });
    }
  }, [queryClient, targetId, status]);
}

/** «Применить (N)» and «Отменить изменения». */
function DraftActions({
  size,
  disabled,
  onApply,
  onDiscard,
}: {
  size: number;
  disabled: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="draft-actions">
      <button type="button" className="primary" disabled={disabled} onClick={onApply}>
        Применить ({size})
      </button>
      <button type="button" className="ghost" disabled={disabled} onClick={onDiscard}>
        Отменить изменения
      </button>
    </div>
  );
}

/**
 * The draft of changes above the message form: what the agent recorded, ✕ for each change,
 * «Применить (N)» and «Отменить изменения». The draft outlives the session, so a reopened chat
 * shows «Есть неприменённые изменения (N)».
 */
export function DraftChanges({
  targetId,
  status,
}: {
  targetId: string;
  status: SessionView["status"];
}) {
  const draft = useDraft(targetId);
  useDraftAfterTurn(targetId, status);
  const apply = useDraftApply(targetId);
  const { remove, discard } = useDraftRemoval(targetId);
  const busy = apply.isPending || remove.isPending || discard.isPending;
  const changes = draft.data ?? [];
  if (changes.length === 0) {
    return <DraftFailure applying={apply.error} removing={null} />;
  }
  return (
    <section className="draft-changes" aria-label="Черновик изменений">
      <h3>Есть неприменённые изменения ({changes.length})</h3>
      <ChangeList
        changes={changes}
        disabled={busy}
        onRemove={(changeId) => {
          remove.mutate(changeId);
        }}
      />
      <DraftFailure applying={apply.error} removing={remove.error ?? discard.error} />
      <DraftActions
        size={changes.length}
        disabled={busy}
        onApply={() => {
          apply.mutate();
        }}
        onDiscard={() => {
          discard.mutate();
        }}
      />
    </section>
  );
}
