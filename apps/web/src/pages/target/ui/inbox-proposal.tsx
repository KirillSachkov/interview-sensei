import { useState } from "react";

import { useTranscription } from "@/entities/transcription";
import type {
  InboxState,
  ModelId,
  ProposalItem,
  SessionView,
  TranscriptionStatus,
} from "@/shared/api";

import { sizeText, sourceTypeNames } from "../lib/source-names";
import {
  useDismissProposal,
  useInbox,
  useInboxAfterTurn,
  useStartProcessing,
} from "../model/inbox";
import { ProposalActions } from "./proposal-actions";
import { RecheckProposal } from "./recheck-proposal";
import { TranscriptionConsent } from "./transcription-consent";

type Language = Extract<TranscriptionStatus, { available: true }>["languages"][number];

/**
 * The language of a recording for its speech recognition: the languages a model can hear, and the
 * chosen one even when no model hears it, such as the Target's own language.
 */
function LanguageChoice({
  item,
  language,
  languages,
  disabled,
  onChoose,
}: {
  item: ProposalItem;
  language: string;
  languages: readonly Language[];
  disabled: boolean;
  onChoose: (language: string) => void;
}) {
  const known = languages.some((option) => option.code === language);
  return (
    <label className="proposal-language">
      <span className="muted">Язык речи</span>
      <select
        aria-label={`Язык речи «${item.title}»`}
        value={language}
        disabled={disabled}
        onChange={(event) => {
          onChoose(event.target.value);
        }}
      >
        {known ? null : <option value={language}>{language}</option>}
        {languages.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
      {known ? null : (
        <span className="muted">
          этот язык приложение не распознаёт: приложите транскрипт с тем же именем файла
        </span>
      )}
    </label>
  );
}

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
        {item.video && language.languages.length > 0 ? (
          <LanguageChoice
            item={item}
            language={language.value}
            languages={language.languages}
            disabled={disabled}
            onChoose={(code) => {
              language.onChoose(code);
            }}
          />
        ) : null}
      </span>
    </li>
  );
}

/** The language the Candidate chose for each recording, the Target's language at first. */
function useLanguages() {
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>({});
  const languageOf = (item: ProposalItem) => chosen[item.sourceId] ?? item.language ?? "ru";
  const choose = (sourceId: string, language: string) => {
    setChosen({ ...chosen, [sourceId]: language });
  };
  const forStart = (chosenItems: readonly ProposalItem[]) =>
    Object.fromEntries(
      chosenItems.filter((item) => item.video).map((item) => [item.sourceId, languageOf(item)]),
    );
  return { languageOf, choose, forStart };
}

/** The materials the Candidate unticked; the rest go to the processing. */
function useUnticked() {
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const toggle = (sourceId: string, checked: boolean) => {
    const next = new Set(unticked);
    if (checked) {
      next.delete(sourceId);
    } else {
      next.add(sourceId);
    }
    setUnticked(next);
  };
  return { unticked, toggle };
}

/**
 * The models the chosen recordings miss for their languages: GigaAM for Russian, Parakeet for the
 * other languages it hears; a language no model hears needs a transcript instead.
 */
function missingModels(languages: readonly Language[], chosen: readonly string[]): Set<ModelId> {
  const missing = new Set<ModelId>();
  for (const code of chosen) {
    const language = languages.find((option) => option.code === code);
    if (language?.model === null) {
      missing.add(code === "ru" ? "gigaam-v3" : "parakeet-v3");
    }
  }
  return missing;
}

/**
 * What the Candidate chose in the card: the ticked materials, the language of each recording, and
 * the models the ticked recordings miss for their languages.
 */
function useCardChoice(proposal: NonNullable<InboxState["proposal"]>) {
  const { unticked, toggle } = useUnticked();
  const languages = useLanguages();
  const { data: status } = useTranscription();
  const available = status?.available === true ? status : null;
  const chosen = proposal.items.filter((item) => !unticked.has(item.sourceId));
  const videos = chosen.filter((item) => item.video);
  const missing = missingModels(
    available?.languages ?? [],
    videos.map((item) => languages.languageOf(item)),
  );
  return {
    unticked,
    toggle,
    languages,
    known: available?.languages ?? [],
    chosen,
    videos,
    missing,
    // A video waits for the download of speech recognition; without it the video gets «ошибка».
    downloading: available !== null && available.installation !== null,
  };
}

type CardChoice = ReturnType<typeof useCardChoice>;

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
  const { chosen, videos, missing } = choice;
  return (
    <section className="draft-changes inbox-proposal" aria-label="Разбор материалов">
      <h3>Разбор материалов</h3>
      <ProposalList items={proposal.items} choice={choice} disabled={busy} />
      {videos.length > 0 ? (
        <TranscriptionConsent key={[...missing].join(",")} missing={missing} />
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
export function InboxProposal({
  targetId,
  status,
}: {
  targetId: string;
  status: SessionView["status"];
}) {
  const { inbox } = useInbox(targetId);
  useInboxAfterTurn(targetId, status);
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
