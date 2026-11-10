import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchTranscription, installTranscription } from "@/shared/api";
import type { ModelId } from "@/shared/api";

const transcriptionQueryKey = ["transcription"];

/** How often the card asks the server about a running download. */
const pollingMs = 500;

/**
 * Speech recognition on this device; while a download runs, the card asks again twice a second
 * for its progress.
 */
export function useTranscription() {
  return useQuery({
    queryKey: transcriptionQueryKey,
    queryFn: fetchTranscription,
    refetchInterval: (query) => {
      const status = query.state.data;
      return status?.available === true && status.installation !== null ? pollingMs : false;
    },
  });
}

/** «Скачать»: the server answers at once and downloads in the background. */
export function useInstallTranscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (models: readonly ModelId[]) => installTranscription(models),
    onSettled: async () => queryClient.invalidateQueries({ queryKey: transcriptionQueryKey }),
  });
}
