// Sections in the draft of changes. The draft names Sections; a rename gives a Section a new name
// and keeps its id, so its Mock interviews and Attempts stay with it.

/** `from` becomes `to`: the Section keeps its id. */
export interface SectionRename {
  readonly from: string;
  readonly to: string;
}

/** The key two Section names match by: the same words, ignoring case and spaces around them. */
export function sectionKey(name: string): string {
  return name.trim().replaceAll(/\s+/gu, " ").toLowerCase();
}

/**
 * The Sections by the key of their name after the renames, which take effect at once, so two
 * Sections may swap names. A rename of a Section that is not there, or to the name of a Section
 * that keeps its own, is a problem.
 */
export function renamedSections<Section extends { readonly name: string }>(
  sections: readonly Section[],
  renames: readonly SectionRename[],
): { current: Map<string, Section>; missing: string[] } {
  const before = new Map(sections.map((section) => [sectionKey(section.name), section]));
  const renamed = renames.flatMap(({ from, to }) => {
    const section = before.get(sectionKey(from));
    return section === undefined ? [] : [{ from: sectionKey(from), to, section }];
  });
  const left = new Set(renamed.map(({ from }) => from));
  const current = new Map([...before].filter(([key]) => !left.has(key)));
  const missing = renames
    .filter(({ from }) => !before.has(sectionKey(from)))
    .map(({ from }) => `Секции «${from.trim()}» нет в цели.`);
  for (const { to, section } of renamed) {
    if (current.has(sectionKey(to))) {
      missing.push(`Секция «${to.trim()}» уже есть в цели.`);
    } else {
      current.set(sectionKey(to), section);
    }
  }
  return { current, missing };
}
