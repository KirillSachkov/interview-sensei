import { StartError } from "./start-error.ts";

/** The port of the app when the Candidate sets none. */
const defaultPort = 4310;
/** How many ports after the default the `interview-sensei` command tries when it is taken. */
const sparePorts = 9;

/** The ports to listen on, tried in order, and how the Candidate sets another one. */
export interface PortChoice {
  readonly ports: readonly number[];
  /** Ends the message about taken ports: «задайте другой порт <hint>». */
  readonly hint: string;
}

/** The port number in `text`, which comes from `source`, such as a flag or a variable. */
function parsePort(text: string, source: string): number {
  const port = Number(text);
  if (!/^\d+$/u.test(text) || port > 65_535) {
    throw new StartError(
      `Порт «${text}» в ${source} не подходит: нужно целое число от 0 до 65535.`,
    );
  }
  return port;
}

/** SERVER_PORT, or null when it is unset or empty. */
function variablePort(env: NodeJS.ProcessEnv): number | null {
  const text = env.SERVER_PORT;
  return text === undefined || text === "" ? null : parsePort(text, "SERVER_PORT");
}

/**
 * The port of `pnpm dev`: SERVER_PORT or 4310 and no other, because Vite forwards `/api` to
 * exactly that port.
 */
export function serverPort(env: NodeJS.ProcessEnv): PortChoice {
  return { ports: [variablePort(env) ?? defaultPort], hint: "в SERVER_PORT" };
}

/**
 * The ports of the `interview-sensei` command. A port the Candidate sets, by the `--port` flag
 * or SERVER_PORT, is the only one to try. Otherwise the command tries 4310 and the nine ports
 * after it, so another program on 4310 does not stop the app.
 */
export function launchPorts(flag: string | undefined, env: NodeJS.ProcessEnv): PortChoice {
  if (flag !== undefined) {
    return { ports: [parsePort(flag, "--port")], hint: "флагом --port" };
  }
  const variable = variablePort(env);
  if (variable !== null) {
    return { ports: [variable], hint: "в SERVER_PORT" };
  }
  return {
    ports: Array.from({ length: sparePorts + 1 }, (_port, index) => defaultPort + index),
    hint: "флагом --port",
  };
}
