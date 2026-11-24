export function openWorkspace(
  current: string | undefined,
  createWorkspace: () => Promise<string>,
): Promise<string> {
  return current === undefined ? createWorkspace() : Promise.resolve(current);
}
