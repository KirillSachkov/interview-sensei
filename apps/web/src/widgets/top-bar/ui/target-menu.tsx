import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { archiveTarget, deleteTarget, fetchSessions, restoreTarget } from "@/shared/api";
import type { TargetSummary } from "@/shared/api";

import { Menu, MenuItem } from "./menu";

const liveStatuses = new Set(["starting", "idle", "working"]);

/** Whether an agent session of the Target runs now; the menu asks each time it opens. */
function useSessionRunning(targetId: string): boolean {
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
    refetchOnMount: "always",
  });
  return (sessions.data ?? []).some(
    (session) => session.targetId === targetId && liveStatuses.has(session.status),
  );
}

/** «В архив» of an active Target; unavailable while an agent session of the Target runs. */
function ArchiveItem({ target, onArchive }: { target: TargetSummary; onArchive: () => void }) {
  const running = useSessionRunning(target.id);
  return (
    <MenuItem
      disabled={running}
      hint={running ? "недоступно, пока идёт сессия агента" : "цель уйдёт из списка целей"}
      onChoose={onArchive}
    >
      В архив
    </MenuItem>
  );
}

/** Asks the Candidate to confirm the deletion of a draft Target, which has no archive. */
function DeleteDraftDialog({
  onConfirm,
  onCancel,
  pending,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="dialog-backdrop">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-draft-title"
        className="island dialog"
      >
        <h2 id="delete-draft-title">Удалить черновик цели?</h2>
        <p>Черновик и его чат настройки удалятся сразу, без архива. Это нельзя отменить.</p>
        <div className="dialog-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="danger" disabled={pending} onClick={onConfirm}>
            Удалить
          </button>
        </div>
      </section>
    </div>
  );
}

type Action = "archive" | "restore" | "delete";

async function run(action: Action, id: string): Promise<unknown> {
  switch (action) {
    case "archive": {
      return archiveTarget(id);
    }
    case "restore": {
      return restoreTarget(id);
    }
    case "delete": {
      return deleteTarget(id);
    }
    default: {
      return action satisfies never;
    }
  }
}

/** The actions on the Target that the menu offers for its status. */
function TargetActions({
  target,
  onAction,
}: {
  target: TargetSummary;
  onAction: (action: Action | "confirm-delete") => void;
}) {
  switch (target.status) {
    case "active": {
      return <ArchiveItem target={target} onArchive={() => onAction("archive")} />;
    }
    case "draft": {
      return <MenuItem onChoose={() => onAction("confirm-delete")}>Удалить черновик</MenuItem>;
    }
    case "archived": {
      return <MenuItem onChoose={() => onAction("restore")}>Вернуть из архива</MenuItem>;
    }
    default: {
      return target.status satisfies never;
    }
  }
}

/**
 * «Меню цели»: «В архив» for an active Target, «Удалить черновик» for a draft, «Вернуть из архива»
 * for an archived one. An archived or deleted Target leaves the canvas for the start page.
 */
export function TargetMenu({ target }: { target: TargetSummary }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const change = useMutation({
    mutationFn: async (action: Action) => run(action, target.id),
    onSuccess: async (_result, action) => {
      setConfirming(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["targets"], exact: true }),
        queryClient.invalidateQueries({ queryKey: ["targets", "archived"] }),
        queryClient.invalidateQueries({ queryKey: ["targets", target.id], exact: true }),
      ]);
      if (action !== "restore") {
        await navigate({ to: "/" });
      }
    },
  });
  return (
    <>
      <Menu label="Меню цели" buttonLabel="Меню цели" button={<span aria-hidden="true">⋯</span>}>
        {(close) => (
          <TargetActions
            target={target}
            onAction={(action) => {
              close();
              if (action === "confirm-delete") {
                setConfirming(true);
              } else {
                change.mutate(action);
              }
            }}
          />
        )}
      </Menu>
      {confirming ? (
        <DeleteDraftDialog
          pending={change.isPending}
          onConfirm={() => {
            change.mutate("delete");
          }}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      ) : null}
      {change.isError ? <p role="alert">Не получилось: {change.error.message}</p> : null}
    </>
  );
}
