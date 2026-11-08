import path from "node:path";

import type { Installation } from "../domain/agent.ts";

/** The programs of this installation: the running Node.js and the fake agent next to this file. */
export function localInstallation(): Installation {
  return {
    nodeExecutable: process.execPath,
    fakeAgentScript: path.join(import.meta.dirname, "fake-agent.ts"),
  };
}
