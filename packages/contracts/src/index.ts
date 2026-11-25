import { z } from "zod";
export const guestWorkspace = z.strictObject({ workspaceId: z.uuid() });
export const guestWorkspacePath = "/api/guest-workspace";

export const goalSetupPath = (workspaceId: string) =>
  `/api/workspaces/${workspaceId}/goal-setup`;
const goalDetails = z.strictObject({
  role: z.string().nullable(),
  level: z.string().nullable(),
  market: z.string().nullable(),
});
const proposal = z.strictObject({
  kind: z.literal("proposal"),
  text: z.string(),
  version: z.int().positive(),
});
const goalSetupDraft = z.strictObject({
  revision: z.int().nonnegative(),
  details: goalDetails,
  current: z
    .discriminatedUnion("kind", [
      proposal,
      z.strictObject({ kind: z.literal("question"), text: z.string() }),
    ])
    .nullable(),
});
const dialogueTurn = z.strictObject({
  turnId: z.uuid(),
  message: z.string(),
  reply: z.string(),
});
export const goalSetup = z.strictObject({
  draft: goalSetupDraft,
  history: z.array(dialogueTurn),
});
export const goalSetupTurn = dialogueTurn.extend({
  draft: goalSetupDraft,
  path: z.array(z.string()),
});
export const goalSetupTurnPath = (workspaceId: string, turnId: string) =>
  `${goalSetupPath(workspaceId)}/turns/${turnId}`;
export const goalSetupMessage = z.strictObject({
  message: z.string().trim().min(1).max(4000),
  revision: z.int().nonnegative().max(2147483646),
});
export const goalSetupCommand = goalSetupMessage.extend({ turnId: z.uuid() });
