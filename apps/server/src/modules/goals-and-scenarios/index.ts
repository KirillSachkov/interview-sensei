export interface WorkspaceStore {
  find(secret: string): Promise<string | undefined>;
  create(secret: string): Promise<string>;
}
export async function openWorkspace(
  store: WorkspaceStore,
  secret: string | undefined,
  issueSecret: () => string,
) {
  const existing = secret && (await store.find(secret));
  if (existing) return { workspaceId: existing };
  const newSecret = issueSecret();
  return { workspaceId: await store.create(newSecret), newSecret };
}
