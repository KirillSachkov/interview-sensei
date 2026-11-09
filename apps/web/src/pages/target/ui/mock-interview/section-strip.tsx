import { useQuery } from "@tanstack/react-query";

import { fetchPlanSections } from "@/shared/api";
import type { InterviewView } from "@/shared/api";

/** The selected Sections of the Mock interview in its order; the current one stands out. */
export function SectionStrip({ view }: { view: InterviewView }) {
  const sections = useQuery({
    queryKey: ["targets", view.targetId, "plan-sections"],
    queryFn: async () => fetchPlanSections(view.targetId),
  });
  const names = new Map((sections.data ?? []).map((section) => [section.id, section.name]));
  return (
    <ol className="section-strip" aria-label="Секции мока">
      {view.sectionIds.map((id) => (
        <li
          key={id}
          className={id === view.currentSectionId ? "current" : undefined}
          aria-current={id === view.currentSectionId ? "step" : undefined}
        >
          {names.get(id) ?? "…"}
        </li>
      ))}
    </ol>
  );
}
