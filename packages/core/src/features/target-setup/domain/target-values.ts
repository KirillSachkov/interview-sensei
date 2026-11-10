// The values of a Target's fields that the draft of changes and the agent's tools share.

export const levels = ["junior", "middle", "senior"] as const;
export type Level = (typeof levels)[number];

export const tones = ["friendly", "neutral", "strict"] as const;
export type Tone = (typeof tones)[number];

export const sectionKinds = ["conversation", "topics", "design"] as const;
export type SectionKind = (typeof sectionKinds)[number];

/** How much a Topic matters for the Target: «высокая», «обычная» or «низкая». */
export const importances = ["high", "normal", "low"] as const;
export type Importance = (typeof importances)[number];
