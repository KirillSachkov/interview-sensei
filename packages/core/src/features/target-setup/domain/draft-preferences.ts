// Preferences in the draft of changes: the Candidate's rules for the Target in plain language.

/** A Preference of the Target as the draft sees it. */
export interface DraftPreference {
  readonly id: string;
  readonly text: string;
  readonly rejectedQuestionIds: readonly string[];
  /** A Preference is turned off rather than deleted. */
  readonly active: boolean;
}

/** Adds the Preference with a new `id`, or changes the given fields of the one with this `id`. */
export interface PreferenceChange {
  readonly id: string;
  readonly text?: string;
  readonly rejectedQuestionIds?: readonly string[];
  readonly active?: boolean;
}

/** The Preferences after the change; `missing` when it changes a Preference that does not exist. */
export function savedPreference(
  preferences: readonly DraftPreference[],
  { id, ...fields }: PreferenceChange,
): { preferences: readonly DraftPreference[]; missing: readonly string[] } {
  if (preferences.some((preference) => preference.id === id)) {
    return {
      preferences: preferences.map((preference) =>
        preference.id === id ? { ...preference, ...fields } : preference,
      ),
      missing: [],
    };
  }
  if (fields.text === undefined) {
    return { preferences, missing: [`Preference ${id} нет в цели.`] };
  }
  const added = {
    id,
    text: fields.text,
    rejectedQuestionIds: fields.rejectedQuestionIds ?? [],
    active: fields.active ?? true,
  };
  return { preferences: [...preferences, added], missing: [] };
}
