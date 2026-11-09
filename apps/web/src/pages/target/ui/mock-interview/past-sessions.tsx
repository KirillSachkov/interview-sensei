import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchHistory, fetchPlanSections } from "@/shared/api";
import type { HistoryPage, PlanSection, SessionSummary } from "@/shared/api";

import { SessionCardBody, sessionsWord } from "./session-card";
import { SessionHistory } from "./session-history";

/** How many ended sessions the canvas shows as collapsed cards. */
const cardCount = 5;

/** The newest ended sessions for the cards, and how many more the history holds. */
function cardsOf({ items, total }: HistoryPage) {
  const ended = items.filter((session) => session.status !== "running");
  const cards = ended.slice(0, cardCount);
  return { cards, more: total - (items.length - ended.length) - cards.length };
}

/** The collapsed cards; a click shows the session on the canvas, a click on the shown one hides it. */
function SessionCards({
  cards,
  sections,
  shownId,
  onShow,
}: {
  cards: readonly SessionSummary[];
  sections: readonly PlanSection[];
  shownId: string | null;
  onShow: (id: string | null) => void;
}) {
  return (
    <ul className="session-cards">
      {cards.map((session) => (
        <li key={session.id}>
          <button
            type="button"
            className="session-card"
            aria-pressed={session.id === shownId}
            onClick={() => {
              onShow(session.id === shownId ? null : session.id);
            }}
          >
            <SessionCardBody session={session} sections={sections} />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** «ещё N сессий», or «История сессий» without more, and the panel it opens. */
function MoreSessions({
  targetId,
  more,
  sections,
  onShow,
}: {
  targetId: string;
  more: number;
  sections: readonly PlanSection[];
  onShow: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="ghost more-sessions"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {more > 0 ? `ещё ${more} ${sessionsWord(more)}` : "История сессий"}
      </button>
      {open ? (
        <SessionHistory
          targetId={targetId}
          sections={sections}
          onShow={(id) => {
            setOpen(false);
            onShow(id);
          }}
          onClose={() => {
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The last 5 ended sessions as collapsed cards with their date, Sections and average Grade, and
 * «ещё N сессий», which opens «История сессий».
 */
export function PastSessions({
  targetId,
  shownId,
  onShow,
}: {
  targetId: string;
  shownId: string | null;
  onShow: (id: string | null, from: "card" | "history") => void;
}) {
  const history = useQuery({
    queryKey: ["history", targetId, 1, {}],
    queryFn: async () => fetchHistory(targetId, { page: 1 }),
  });
  const sections = useQuery({
    queryKey: ["targets", targetId, "plan-sections"],
    queryFn: async () => fetchPlanSections(targetId),
  });
  if (history.isError) {
    return <p role="alert">История сессий не загрузилась: {history.error.message}</p>;
  }
  const { cards, more } =
    history.data === undefined ? { cards: [], more: 0 } : cardsOf(history.data);
  if (cards.length === 0 || sections.data === undefined) {
    return null;
  }
  return (
    <section className="past-sessions" aria-label="Прошлые сессии">
      <h3>Прошлые сессии</h3>
      <SessionCards
        cards={cards}
        sections={sections.data}
        shownId={shownId}
        onShow={(id) => {
          onShow(id, "card");
        }}
      />
      <MoreSessions
        targetId={targetId}
        more={more}
        sections={sections.data}
        onShow={(id) => {
          onShow(id, "history");
        }}
      />
    </section>
  );
}
