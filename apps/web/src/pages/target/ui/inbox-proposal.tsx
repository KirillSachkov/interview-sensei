import type { AvailableTranscription, InboxState, ProposalItem } from "@/shared/api";
import { sizeText } from "@/shared/lib";

import { sourceTypeNames } from "../lib/source-names";
import { useCardChoice } from "../model/card-choice";
import type { CardChoice } from "../model/card-choice";
import {
  useDismissProposal,
  useInbox,
  useInboxAfterTurn,
  useStartProcessing,
} from "../model/inbox";
import { ProposalActions } from "./proposal-actions";
import { RecheckProposal } from "./recheck-proposal";
import { SpeechLanguage } from "./speech-language";
import { TranscriptionConsent } from "./transcription-consent";

type Language = AvailableTranscription["languages"][number];

/**
 * One material of the card: its checkbox, title, type, size and the agent's assessment; the
 * language of a recording, or the transcript bound to it.
 */
function ProposalLine({
  item,
  checked,
  disabled,
  onToggle,
  language,
}: {
  item: ProposalItem;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  language: { value: string; languages: readonly Language[]; onChoose: (code: string) => void };
}) {
  const volume = item.size === null ? "ссылка" : sizeText(item.size);
  return (
    <li className="inbox-proposal-item">
      <input
        type="checkbox"
        aria-label={`Разобрать «${item.title}»`}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onToggle(event.target.checked);
        }}
      />
      <span className="inbox-proposal-text">
        <span className="source-title">{item.title}</span>
        <span className="muted">
          {sourceTypeNames[item.type]} · {volume} — {item.assessment}
        </span>
        {item.transcript === null ? null : (
          <span className="muted">Текст возьмётся из «{item.transcript}», без распознавания.</span>
        )}
        <SpeechLanguage item={item} language={language} disabled={disabled} />
      </span>
    </li>
  );
}

/** The materials of the card with their checkboxes and the languages of recordings. */
function ProposalList({
  items,
  choice,
  disabled,
}: {
  items: readonly ProposalItem[];
  choice: CardChoice;
  disabled: boolean;
}) {
  return (
    <ul className="draft-change-list">
      {items.map((item) => (
        <ProposalLine
          key={item.sourceId}
          item={item}
          checked={!choice.unticked.has(item.sourceId)}
          disabled={disabled}
          onToggle={(checked) => {
            choice.toggle(item.sourceId, checked);
          }}
          language={{
            value: choice.languages.languageOf(item),
            languages: choice.known,
            onChoose: (code) => {
              choice.languages.choose(item.sourceId, code);
            },
          }}
        />
      ))}
    </ul>
  );
}

function ProposalCard({
  targetId,
  proposal,
}: {
  targetId: string;
  proposal: NonNullable<InboxState["proposal"]>;
}) {
  const start = useStartProcessing(targetId);
  const dismiss = useDismissProposal(targetId, "processing");
  const choice = useCardChoice(proposal);
  const busy = start.isPending || dismiss.isPending;
  const { chosen, videos, needs } = choice;
  return (
    <section className="draft-changes inbox-proposal" aria-label="Разбор материалов">
      <h3>Разбор материалов</h3>
      <ProposalList items={proposal.items} choice={choice} disabled={busy} />
      {videos.length > 0 ? (
        <TranscriptionConsent
          key={[...needs.missing, needs.links ? "links" : ""].join(",")}
          needs={needs}
        />
      ) : null}
      {start.error === null ? null : <p role="alert">Разбор не начался: {start.error.message}</p>}
      <ProposalActions
        startLabel="Запустить разбор"
        disabled={busy}
        canStart={chosen.length > 0 && !(videos.length > 0 && choice.downloading)}
        onStart={() => {
          start.mutate({
            sourceIds: chosen.map((item) => item.sourceId),
            languages: choice.languages.forStart(chosen),
          });
        }}
        onDismiss={() => {
          dismiss.mutate();
        }}
      />
    </section>
  );
}

/**
 * The card «Разбор материалов» above the setup chat's message form, after the agent's
 * `propose_inbox_processing`: the materials with checkboxes, «Запустить разбор» and «Не сейчас»;
 * and the card «Перепроверка базы» after `propose_recheck`. Only these buttons start the work;
 * a card goes once the Candidate answers.
 */
export function InboxProposal({ targetId, turn }: { targetId: string; turn: number | null }) {
  const { inbox } = useInbox(targetId);
  useInboxAfterTurn(targetId, turn);
  const proposal = inbox.data?.proposal ?? null;
  const recheck = inbox.data?.recheckProposal ?? null;
  return (
    <>
      {proposal === null ? null : (
        <ProposalCard key={proposal.id} targetId={targetId} proposal={proposal} />
      )}
      {recheck === null ? null : (
        <RecheckProposal key={recheck.id} targetId={targetId} proposal={recheck} />
      )}
    </>
  );
}
