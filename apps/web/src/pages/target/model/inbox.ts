import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import {
  dismissInboxProposal,
  dismissRecheckProposal,
  fetchInbox,
  startInboxProcessing,
  startRecheck,
  stopInboxProcessing,
} from "@/shared/api";
import type { SessionView } from "@/shared/api";

import { refreshAppliedViews } from "./plan-views";
import { sourcesQueryKey } from "./source-attachments";

/** The query of the Target's Inbox processing: the card, the running processing, the report. */
function inboxQueryKey(targetId: string) {
  return ["targets", targetId, "inbox"];
}

/** How often the page asks the server about a running processing. */
const pollingMs = 1000;

/**
 * The Target's Inbox processing; while it runs, the page asks again every second. When it ends,
 * the materials, the plan and the Questions reload: the agent added Questions and Topics.
 */
export function useInbox(targetId: string) {
  const queryClient = useQueryClient();
  const inbox = useQuery({
    queryKey: inboxQueryKey(targetId),
    queryFn: async () => fetchInbox(targetId),
    refetchInterval: (query) => ((query.state.data?.run ?? null) === null ? false : pollingMs),
  });
  const running = (inbox.data?.run ?? null) !== null;
  const wasRunning = useRef(running);
  useEffect(() => {
    if (wasRunning.current && !running) {
      void queryClient.invalidateQueries({ queryKey: sourcesQueryKey(targetId) });
      void queryClient.invalidateQueries({ queryKey: ["targets", targetId, "inbox-reports"] });
      void refreshAppliedViews(queryClient, targetId);
    }
    wasRunning.current = running;
  }, [queryClient, running, targetId]);
  return { inbox, running };
}

/** «Запустить разбор»: the server answers at once and reads the materials in the background. */
export function useStartProcessing(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * The chosen materials, null for every material in the Inbox, and the language of each chosen
     * recording.
     */
    mutationFn: async (
      chosen: { sourceIds: readonly string[]; languages: Readonly<Record<string, string>> } | null,
    ) => startInboxProcessing(targetId, chosen?.sourceIds, chosen?.languages),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inboxQueryKey(targetId) }),
        queryClient.invalidateQueries({ queryKey: sourcesQueryKey(targetId) }),
      ]);
    },
  });
}

/** «Запустить перепроверку»: the server answers at once and starts the recheck in the background. */
export function useStartRecheck(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => startRecheck(targetId),
    onSettled: async () => queryClient.invalidateQueries({ queryKey: inboxQueryKey(targetId) }),
  });
}

/**
 * «Не сейчас» on a card: «Разбор материалов» leaves the materials in the Inbox, «Перепроверка
 * базы» leaves the bank as it is.
 */
export function useDismissProposal(targetId: string, card: "processing" | "recheck") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      card === "processing" ? dismissInboxProposal(targetId) : dismissRecheckProposal(targetId),
    onSettled: async () => queryClient.invalidateQueries({ queryKey: inboxQueryKey(targetId) }),
  });
}

/** «Остановить разбор»: the server answers once the processing is closed with a partial report. */
export function useStopProcessing(targetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => stopInboxProcessing(targetId),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inboxQueryKey(targetId) }),
        queryClient.invalidateQueries({ queryKey: sourcesQueryKey(targetId) }),
      ]);
    },
  });
}

/** Reloads the proposal whenever the setup agent ends a turn: it proposes during the turn. */
export function useInboxAfterTurn(targetId: string, status: SessionView["status"]) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (status === "idle") {
      void queryClient.invalidateQueries({ queryKey: inboxQueryKey(targetId) });
    }
  }, [queryClient, targetId, status]);
}
