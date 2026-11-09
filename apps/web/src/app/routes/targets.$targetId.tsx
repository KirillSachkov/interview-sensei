import { createFileRoute } from "@tanstack/react-router";

import { TargetPage } from "@/pages/target";

export const Route = createFileRoute("/targets/$targetId")({ component: TargetRouteView });

function TargetRouteView() {
  const { targetId } = Route.useParams();
  // A new key resets the canvas when the Candidate switches Targets.
  return <TargetPage key={targetId} targetId={targetId} />;
}
