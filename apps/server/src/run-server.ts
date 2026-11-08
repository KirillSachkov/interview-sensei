import { homedir } from "node:os";

import { DataDirectoryInUseError, resolveDataDirectory } from "@interview-sensei/core/storage";
import { systemClock, systemTimer } from "@interview-sensei/core/time";
import type { FastifyInstance } from "fastify";

import { buildServer } from "./server.ts";

interface RunOptions {
  /** The built web app to serve; see ServerDependencies. */
  webDirectory?: string;
  /** Called with the server's URL once it listens. */
  onListening?: (url: string) => void;
}

/** A start failure the Candidate can fix: the message replaces the stack trace. */
class StartError extends Error {
  override name = "StartError";
}

function isPortInUse(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

async function listen(server: FastifyInstance, host: string, port: number): Promise<void> {
  try {
    await server.listen({ host, port });
  } catch (error) {
    // Close writes the final dump and releases the lock, so a failed start ends like a stop.
    await server.close();
    if (isPortInUse(error)) {
      throw new StartError(
        `Порт ${port} на ${host} занят. Остановите программу на нём или задайте другой порт в SERVER_PORT.`,
        { cause: error },
      );
    }
    throw error;
  }
}

async function start({ webDirectory, onListening }: RunOptions): Promise<void> {
  // Local application: listen on the loopback interface only.
  const host = process.env.SERVER_HOST ?? "127.0.0.1";
  const port = Number(process.env.SERVER_PORT ?? "4310");
  const server = await buildServer({
    clock: systemClock,
    timer: systemTimer,
    dataDirectory: resolveDataDirectory({
      env: process.env,
      home: homedir(),
      workingDirectory: process.cwd(),
    }),
    logger: true,
    // Tests and manual checks without a subscription; the Candidate's agents need no variable.
    fakeAgent: process.env.INTERVIEW_SENSEI_FAKE_AGENT === "1",
    ...(webDirectory === undefined ? {} : { webDirectory }),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void server.close();
    });
  }
  await listen(server, host, port);
  onListening?.(`http://${host}:${port}/`);
}

/**
 * Starts the server on the data directory of the environment until SIGINT or SIGTERM. A start
 * failure the Candidate can fix, such as a taken data directory or port, prints only its message
 * and sets exit code 1.
 */
export async function runServer(options: RunOptions = {}): Promise<void> {
  try {
    await start(options);
  } catch (error) {
    if (!(error instanceof DataDirectoryInUseError) && !(error instanceof StartError)) {
      throw error;
    }
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
