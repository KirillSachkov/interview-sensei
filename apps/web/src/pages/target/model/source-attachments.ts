import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import type { ChatAttachments } from "@/features/agent-chat";
import { maxSourceFileBytes, uploadSource } from "@/shared/api";

/** The query of the Target's materials, which the «Материалы» card shows. */
export function sourcesQueryKey(targetId: string) {
  return ["targets", targetId, "sources"];
}

/**
 * Files attached in the setup chat become the Target's materials when the message is sent. A file
 * larger than 100 MB is refused at once, before it goes anywhere.
 */
export function useSourceAttachments(targetId: string): ChatAttachments {
  const queryClient = useQueryClient();
  return useMemo(
    () => ({
      refusal: (file) =>
        file.size > maxSourceFileBytes
          ? `Файл «${file.name}» больше 100 МБ. Прикрепите файл до 100 МБ.`
          : null,
      send: async (file) => {
        await uploadSource(targetId, file);
        await queryClient.invalidateQueries({ queryKey: sourcesQueryKey(targetId) });
      },
    }),
    [queryClient, targetId],
  );
}

/** Reloads the materials whenever the agent ends a turn (see turnEnd): `add_sources` adds them during it. */
export function useSourcesAfterTurn(targetId: string, turn: number | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (turn !== null) {
      void queryClient.invalidateQueries({ queryKey: sourcesQueryKey(targetId) });
    }
  }, [queryClient, targetId, turn]);
}
