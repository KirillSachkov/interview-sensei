import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  applyDraft,
  discardDraft,
  DraftProblemsError,
  fetchDraft,
  removeDraftChange,
} from "@/shared/api";
import type { DraftOperation, SessionView } from "@/shared/api";

import { changeDetails, changeText } from "../lib/change-text";
import { refreshAppliedViews } from "../model/plan-views";

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
      await refreshAppliedViews(queryClient, targetId);
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

/** The change's short line; a long change opens its details under it. */
function ChangeLine({ operation }: { operation: DraftOperation }) {
  const details = changeDetails(operation);
  if (details.length === 0) {
    return <span>{changeText(operation)}</span>;
  }
  return (
    <details>
      <summary>{changeText(operation)}</summary>
      <ul>
        {details.map((line, index) => (
          // The lines are the change's own text and may repeat.
          // oxlint-disable-next-line react/no-array-index-key -- a change never changes its lines
          <li key={index}>{line}</li>
        ))}
      </ul>
    </details>
  );
}

/** The changes in the order of recording, each with ✕; the list scrolls when it is long. */
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
    <ol aria-label="Изменения черновика" className="draft-change-list">
      {changes.map((change) => (
        <li key={change.id}>
          <ChangeLine operation={change.operation} />
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

/**
 * Reloads the draft and the Target whenever the agent ends a turn: its tools change the draft
 * during the turn, and its `apply_changes` changes the Target as «Применить» does.
 */
function useDraftAfterTurn(targetId: string, status: SessionView["status"]) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (status === "idle") {
      void queryClient.invalidateQueries({ queryKey: ["targets", targetId, "draft"] });
      void refreshAppliedViews(queryClient, targetId);
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
