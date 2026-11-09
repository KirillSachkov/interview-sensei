import { useMemo, useState } from "react";

import { InboxReportPanel } from "./inbox-report-panel";
import { QuestionsPanel } from "./questions-panel";
import type { QuestionsView } from "./target-plan";

/** What the side panel shows: the Questions of the plan or an Inbox report; one at a time. */
type Shown =
  | { readonly type: "questions"; readonly view: QuestionsView }
  | { readonly type: "report"; readonly reportId: string }
  | null;

/** The side panel's state and the actions that open it. */
export function useSidePanel() {
  const [shown, setShown] = useState<Shown>(null);
  // Stable actions: the canvas zones depend on them.
  const actions = useMemo(
    () => ({
      onQuestions: (view: QuestionsView) => {
        setShown({ type: "questions", view });
      },
      onReport: (reportId: string) => {
        setShown({ type: "report", reportId });
      },
      onClose: () => {
        setShown(null);
      },
    }),
    [],
  );
  return { shown, ...actions };
}

/** The side panel beside the canvas: the Questions of a Section or a Topic, or an Inbox report. */
export function SidePanel({
  targetId,
  panel,
}: {
  targetId: string;
  panel: ReturnType<typeof useSidePanel>;
}) {
  const { shown, onClose } = panel;
  if (shown === null) {
    return null;
  }
  return shown.type === "questions" ? (
    <QuestionsPanel
      key={JSON.stringify(shown.view.scope)}
      targetId={targetId}
      view={shown.view}
      onClose={onClose}
    />
  ) : (
    <InboxReportPanel
      key={shown.reportId}
      targetId={targetId}
      reportId={shown.reportId}
      onClose={onClose}
    />
  );
}
