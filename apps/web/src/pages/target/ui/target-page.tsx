import { useQuery } from "@tanstack/react-query";
import { fetchTarget } from "@/shared/api";
import { TargetCanvas } from "./target-canvas";
import { TargetNotFound } from "./target-not-found";

/** The canvas of one Target, or a message when the address names no Target. */
export function TargetPage({ targetId }: { targetId: string }) {
  const target = useQuery({
    queryKey: ["targets", targetId],
    queryFn: async () => fetchTarget(targetId),
  });
  if (target.isError) {
    return (
      <main className="centered">
        <p role="alert">Цель не загрузилась: {target.error.message}</p>
      </main>
    );
  }
  if (target.data === undefined) {
    return null;
  }
  return target.data === null ? (
    <TargetNotFound />
  ) : (
    <TargetCanvas key={target.data.id} target={target.data} />
  );
}
