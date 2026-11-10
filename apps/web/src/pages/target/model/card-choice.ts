import { useState } from "react";

import { useTranscription } from "@/entities/transcription";
import type { InboxState, ModelId, ProposalItem } from "@/shared/api";

import { missingModels } from "../lib/missing-models";

/**
 * What the chosen materials need: `missing` has the models the chosen files miss for their
 * languages; `links` tells whether a chosen link to a video needs yt-dlp, which is not installed.
 */
export interface Needs {
  readonly missing: ReadonlySet<ModelId>;
  readonly links: boolean;
}

/**
 * The language the Candidate chose for each video or audio file, the Target's language at first.
 * A link's language comes from the video's data, so the card sends none for it.
 */
function useLanguages() {
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>({});
  const languageOf = (item: ProposalItem) => chosen[item.sourceId] ?? item.language ?? "ru";
  const choose = (sourceId: string, language: string) => {
    setChosen({ ...chosen, [sourceId]: language });
  };
  const forStart = (chosenItems: readonly ProposalItem[]) =>
    Object.fromEntries(
      chosenItems
        .filter((item) => item.video && item.url === null)
        .map((item) => [item.sourceId, languageOf(item)]),
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
 * What the Candidate chose in the card: the ticked materials, the language of each file, and what
 * they need: the models the ticked files miss for their languages, and yt-dlp for a ticked link to
 * a video. The server names a link's language and gives «ошибка» with a hint when its model is missing.
 */
export function useCardChoice(proposal: NonNullable<InboxState["proposal"]>) {
  const { unticked, toggle } = useUnticked();
  const languages = useLanguages();
  const { data: status } = useTranscription();
  const available = status?.available === true ? status : null;
  const chosen = proposal.items.filter((item) => !unticked.has(item.sourceId));
  const videos = chosen.filter((item) => item.video);
  const missing = missingModels(
    available?.languages ?? [],
    videos.filter((item) => item.url === null).map((item) => languages.languageOf(item)),
  );
  const links = videos.some((item) => item.url !== null) && available?.ytDlp.installed === false;
  const needs: Needs = { missing, links };
  return {
    unticked,
    toggle,
    languages,
    known: available?.languages ?? [],
    chosen,
    videos,
    needs,
    // A video waits for the download of speech recognition; without it the video gets «ошибка».
    downloading: available !== null && available.installation !== null,
  };
}

export type CardChoice = ReturnType<typeof useCardChoice>;
