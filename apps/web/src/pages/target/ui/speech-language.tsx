import type { AvailableTranscription, ProposalItem } from "@/shared/api";

type Language = AvailableTranscription["languages"][number];

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
 * The language of a video's speech: chosen in the card for a file; for a link the application
 * takes it from the video's data.
 */
export function SpeechLanguage({
  item,
  language,
  disabled,
}: {
  item: ProposalItem;
  language: { value: string; languages: readonly Language[]; onChoose: (code: string) => void };
  disabled: boolean;
}) {
  if (!item.video) {
    return null;
  }
  if (item.url !== null) {
    return <span className="muted">Язык речи приложение узнает из данных видео.</span>;
  }
  return language.languages.length > 0 ? (
    <LanguageChoice
      item={item}
      language={language.value}
      languages={language.languages}
      disabled={disabled}
      onChoose={(code) => {
        language.onChoose(code);
      }}
    />
  ) : null;
}
