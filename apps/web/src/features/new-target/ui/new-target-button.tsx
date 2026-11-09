import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createTarget } from "@/shared/api";

/**
 * «Новая цель»: creates an empty draft Target and opens its canvas, where its setup chat starts
 * the onboarding.
 */
export function NewTargetButton({ big = false }: { big?: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: createTarget,
    onSuccess: async (target) => {
      queryClient.setQueryData(["targets", target.id], target);
      await queryClient.invalidateQueries({ queryKey: ["targets"], exact: true });
      await navigate({ to: "/targets/$targetId", params: { targetId: target.id } });
    },
  });
  return (
    <>
      <button
        type="button"
        className={big ? "primary big" : "ghost"}
        disabled={create.isPending}
        onClick={() => {
          create.mutate();
        }}
      >
        Новая цель
      </button>
      {create.isError ? <p role="alert">Цель не создалась: {create.error.message}</p> : null}
    </>
  );
}
