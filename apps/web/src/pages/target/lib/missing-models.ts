import type { AvailableTranscription, ModelId } from "@/shared/api";

type Language = AvailableTranscription["languages"][number];

/**
 * The models the chosen files miss for their languages: GigaAM for Russian, Parakeet for the other
 * languages it hears; a language no model hears needs a transcript instead.
 */
export function missingModels(
  languages: readonly Language[],
  chosen: readonly string[],
): Set<ModelId> {
  const missing = new Set<ModelId>();
  for (const code of chosen) {
    const language = languages.find((option) => option.code === code);
    if (language?.model === null) {
      missing.add(code === "ru" ? "gigaam-v3" : "parakeet-v3");
    }
  }
  return missing;
}
