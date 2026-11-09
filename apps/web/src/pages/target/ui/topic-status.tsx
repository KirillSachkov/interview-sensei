import type { TopicStatus } from "@/shared/api";

import "./topic-status.css";

export const topicStatusNames: Readonly<Record<TopicStatus, string>> = {
  not_started: "не начато",
  shaky: "шатко",
  confident: "уверенно",
};

/** The dot of a Topic status; it only decorates the status, which the text beside it names. */
export function TopicDot({ status }: { status: TopicStatus }) {
  return (
    <span
      className={`dot topic-dot ${status}`}
      aria-hidden="true"
      title={topicStatusNames[status]}
    />
  );
}

/** The Topic status for screen readers only, beside its dot. */
export function TopicStatusText({ status }: { status: TopicStatus }) {
  return <span className="visually-hidden">: {topicStatusNames[status]}</span>;
}
