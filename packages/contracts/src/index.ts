import { z } from "zod";
export const guestWorkspace = z.strictObject({ workspaceId: z.uuid() });
export const guestWorkspacePath = "/api/guest-workspace";
