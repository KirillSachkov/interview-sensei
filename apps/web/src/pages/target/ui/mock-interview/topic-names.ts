import { useQuery } from "@tanstack/react-query";

import { fetchPlanSections } from "@/shared/api";

/** The names of the Topics of the Target's plan by id, for the line above a question. */
export function useTopicNames(targetId: string): ReadonlyMap<string, string> {
  const sections = useQuery({
    queryKey: ["targets", targetId, "plan-sections"],
    queryFn: async () => fetchPlanSections(targetId),
  });
  return new Map(
    (sections.data ?? []).flatMap((section) =>
      section.topics.map((topic) => [topic.id, topic.name] as const),
    ),
  );
}
