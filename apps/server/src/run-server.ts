import { homedir } from "node:os";

import {
  DataDirectoryInUseError,
  dataDirectoryVariable,
  resolveDataDirectory,
} from "@interview-sensei/core/storage";
import { systemClock, systemTimer } from "@interview-sensei/core/time";
import type { FastifyInstance } from "fastify";

import { appUrl } from "./app-url.ts";
import { isLoopbackHost } from "./loopback.ts";
import { serverPort } from "./ports.ts";
import type { PortChoice, PortSetting } from "./ports.ts";
import { buildServer } from "./server.ts";
import type { LogLevel } from "./server.ts";
import { StartError } from "./start-error.ts";

interface RunOptions {
  /** The built web app to serve; see ServerDependencies. */
  webDirectory?: string;
  /** The application's skills; see ServerDependencies. */
  skillsDirectory?: string;
  /** Called with the URL to open the app at once the server listens. */
  onListening?: (url: string) => void;
  /** The lowest level of the JSON logs on standard output; `info` logs every request. */
  logLevel?: LogLevel;
  /** Browser origins besides the server's own; see ServerDependencies. */
  allowedOrigins?: readonly string[];
  /** The ports to try; by default SERVER_PORT or 4310 and no other. */
  port?: PortChoice;
  /**
   * The data directory the Candidate named, resolved against the working directory; by default
   * INTERVIEW_SENSEI_DATA_DIR or `~/.interview-sensei`.
   */
  dataDirectory?: string;
}

/**
 * The data directory of the command: the one the Candidate named, resolved against the working
 * directory, or INTERVIEW_SENSEI_DATA_DIR or `~/.interview-sensei`.
 */
export function chosenDataDirectory(named: string | undefined): string {
  return resolveDataDirectory({
    env: named === undefined ? process.env : { [dataDirectoryVariable]: named },
    home: homedir(),
    workingDirectory: process.cwd(),
  });
}

function isPortInUse(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

/** How the message about taken ports names the place to set another port. */
const portSettingText: Readonly<Record<PortSetting, string>> = {
  flag: "флагом --port",
  variable: "в SERVER_PORT",
};

function takenPortsMessage(host: string, { ports, setting }: PortChoice): string {
  const [first] = ports;
  const last = ports.at(-1);
  const where = portSettingText[setting];
  if (ports.length === 1) {
    return `Порт ${first} на ${host} занят. Остановите программу на нём или задайте другой порт ${where}.`;
  }
  return `Порты ${first}–${last} на ${host} заняты. Остановите программу на одном из них или задайте другой порт ${where}.`;
}

/** Listens on the first free port; false when every port is taken. */
async function listenOnFreePort(
  server: FastifyInstance,
  host: string,
  ports: readonly number[],
): Promise<boolean> {
  // The ports are tried one at a time, in order, so the first free one wins.
  /* oxlint-disable eslint/no-await-in-loop -- sequential by design, see above */
  for (const port of ports) {
    try {
      await server.listen({ host, port });
      return true;
    } catch (error) {
      if (!isPortInUse(error)) {
        throw error;
      }
    }
  }
  /* oxlint-enable eslint/no-await-in-loop */
  return false;
}

/** Listens on the first free port of the choice; closes the server when it cannot. */
async function listen(server: FastifyInstance, host: string, choice: PortChoice): Promise<void> {
  let listening = false;
  try {
    listening = await listenOnFreePort(server, host, choice.ports);
  } finally {
    // Close writes the final dump and releases the lock, so a failed start ends like a stop.
    if (!listening) {
      await server.close();
    }
  }
  if (!listening) {
    throw new StartError(takenPortsMessage(host, choice));
  }
}

/** The SERVER_HOST to listen on; a local application listens on the loopback interface only. */
function loopbackHost(env: NodeJS.ProcessEnv): string {
  const host = env.SERVER_HOST ?? "127.0.0.1";
  if (!isLoopbackHost(host)) {
    throw new StartError(
      `SERVER_HOST=${host} не loopback-адрес. Сервер слушает только 127.0.0.1, ::1 или localhost.`,
    );
  }
  return host;
}

async function start({
  webDirectory,
  skillsDirectory,
  onListening,
  logLevel = "info",
  allowedOrigins = [],
  port = serverPort(process.env),
  dataDirectory,
}: RunOptions): Promise<void> {
  const host = loopbackHost(process.env);
  const server = await buildServer({
    clock: systemClock,
    timer: systemTimer,
    dataDirectory: chosenDataDirectory(dataDirectory),
    logLevel,
    // Tests and manual checks without a subscription; the Candidate's agents need no variable.
    fakeAgent: process.env.INTERVIEW_SENSEI_FAKE_AGENT === "1",
    userEnvironment: { home: homedir(), env: process.env },
    allowedOrigins,
    ...(webDirectory === undefined ? {} : { webDirectory }),
    ...(skillsDirectory === undefined ? {} : { skillsDirectory }),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void server.close();
    });
  }
  await listen(server, host, port);
  const address = server.server.address();
  if (address !== null && typeof address !== "string") {
    onListening?.(appUrl(address));
  }
}

/**
 * Starts the server on the data directory of the environment until SIGINT or SIGTERM. A start
 * failure the Candidate can fix, such as a taken data directory or port, prints only its message
 * and sets exit code 1. So does a SERVER_PORT that is not a port number.
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
