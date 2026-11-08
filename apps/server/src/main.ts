import { homedir } from "node:os";

import { DataDirectoryInUseError, resolveDataDirectory } from "@interview-sensei/core/storage";
import { systemClock, systemTimer } from "@interview-sensei/core/time";

import { buildServer } from "./server.ts";

// Local application: listen on the loopback interface only.
const host = process.env.SERVER_HOST ?? "127.0.0.1";
const port = Number(process.env.SERVER_PORT ?? "4310");
const dataDirectory = resolveDataDirectory({
  env: process.env,
  home: homedir(),
  workingDirectory: process.cwd(),
});

async function start(): Promise<void> {
  const server = await buildServer({
    clock: systemClock,
    timer: systemTimer,
    dataDirectory,
    logger: true,
    // Tests and manual checks without a subscription; the Candidate's agents need no variable.
    fakeAgent: process.env.INTERVIEW_SENSEI_FAKE_AGENT === "1",
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void server.close();
    });
  }
  try {
    await server.listen({ host, port });
  } catch (error) {
    // Close writes the final dump and releases the lock, so a failed start ends like a stop.
    await server.close();
    throw error;
  }
}

try {
  await start();
} catch (error) {
  if (!(error instanceof DataDirectoryInUseError)) {
    throw error;
  }
  // The Candidate sees only this message: another instance already owns the data.
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
