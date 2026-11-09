import { parseArgs } from "node:util";

import { launchPorts } from "./ports.ts";
import type { PortChoice } from "./ports.ts";
import { StartError } from "./start-error.ts";

/** The help text of the `interview-sensei` command. */
export const usage = `Использование: interview-sensei [--port <порт>] [--data-dir <каталог>] [--no-browser]
       interview-sensei login opencode [--data-dir <каталог>]

  --port <порт>         Порт сервера. Если он занят, приложение завершается.
                        Без флага приложение берёт 4310 или следующий свободный порт.
  --data-dir <каталог>  Каталог данных вместо ~/.interview-sensei.
  --no-browser          Не открывать браузер.
  --help                Показать эту справку.

  login opencode        Войти в OpenCode 2.x для приложения, например по подписке.
                        Вход хранится в каталоге данных; ваш OpenCode не меняется.
`;

/** What the command line and the environment ask the `interview-sensei` command to do. */
export interface LaunchOptions {
  /** Serve the app, or run the application's own OpenCode 2.x login (#69). */
  readonly command: "serve" | "login-opencode";
  /** Print the help text and exit instead of starting the server. */
  readonly help: boolean;
  readonly port: PortChoice;
  /** The `--data-dir` flag, before the working directory resolves it; undefined without it. */
  readonly dataDirectory: string | undefined;
  readonly openBrowser: boolean;
}

const flags = {
  port: { type: "string" },
  "data-dir": { type: "string" },
  "no-browser": { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

const flagsWithValue: ReadonlySet<string> = new Set(
  Object.entries(flags)
    .filter(([, flag]) => flag.type === "string")
    .map(([name]) => name),
);

/** A flag on the command line as parseArgs reads it without its strict checks. */
interface FlagToken {
  readonly name: string;
  readonly rawName: string;
  readonly value: string | undefined;
  /** Whether the value came after `=` in the same argument. */
  readonly inlineValue: boolean | undefined;
}

/**
 * Refuses an unknown flag, a flag without its value and a value of a flag that takes none. A
 * separate argument that starts with a dash is another flag, not a value: `--port --no-browser`
 * has no port. A value after `=` may start with a dash.
 */
function checkFlag({ name, rawName, value, inlineValue }: FlagToken): void {
  if (!Object.hasOwn(flags, name)) {
    throw new StartError(`Неизвестный флаг ${rawName}.`);
  }
  const takesValue = flagsWithValue.has(name);
  const missing = value === undefined || (inlineValue !== true && value.startsWith("-"));
  if (takesValue && missing) {
    throw new StartError(`Флагу ${rawName} нужно значение.`);
  }
  if (!takesValue && value !== undefined) {
    throw new StartError(`Флагу ${rawName} не нужно значение.`);
  }
}

/**
 * The value of each flag on the command line, or true for a flag without a value. It checks every
 * argument itself, so its errors are in Russian and name the argument. A repeated flag keeps its
 * last value.
 */
function readArguments(args: readonly string[]): {
  values: ReadonlyMap<string, string | true>;
  positionals: readonly string[];
} {
  const { tokens } = parseArgs({
    args: [...args],
    options: flags,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const values = new Map<string, string | true>();
  const positionals: string[] = [];
  for (const token of tokens) {
    if (token.kind === "positional") {
      positionals.push(token.value);
    }
    if (token.kind === "option") {
      checkFlag(token);
      values.set(token.name, token.value ?? true);
    }
  }
  return { values, positionals };
}

/** The command after `login`: only `opencode`. */
function loginCommand([agent, extra]: readonly string[]): LaunchOptions["command"] {
  if (agent === undefined) {
    throw new StartError("Команде login нужен агент: interview-sensei login opencode.");
  }
  const unexpected = agent === "opencode" ? extra : agent;
  if (unexpected !== undefined) {
    throw new StartError(`Лишний аргумент «${unexpected}».`);
  }
  return "login-opencode";
}

/** The command of the arguments that are not flags: none, or `login opencode`. */
function command([first, ...rest]: readonly string[]): LaunchOptions["command"] {
  if (first === undefined) {
    return "serve";
  }
  if (first !== "login") {
    throw new StartError(`Лишний аргумент «${first}».`);
  }
  return loginCommand(rest);
}

/** The value of a flag that takes one; undefined when the flag is absent. */
function flagValue(values: ReadonlyMap<string, string | true>, name: string): string | undefined {
  const value = values.get(name);
  return typeof value === "string" ? value : undefined;
}

/**
 * Reads the command `login opencode` and the flags `--port`, `--data-dir`, `--no-browser` and
 * `--help`. The variables SERVER_PORT
 * and INTERVIEW_SENSEI_NO_BROWSER=1 work as before; a flag goes over its variable. Throws
 * StartError for an unknown flag, a missing or extra value or a wrong port.
 */
export function launchOptions({
  args,
  env,
}: {
  args: readonly string[];
  env: NodeJS.ProcessEnv;
}): LaunchOptions {
  const { values, positionals } = readArguments(args);
  const dataDirectory = flagValue(values, "data-dir");
  if (dataDirectory === "") {
    throw new StartError("Флагу --data-dir нужен непустой путь.");
  }
  return {
    command: command(positionals),
    help: values.has("help"),
    port: launchPorts(flagValue(values, "port"), env),
    dataDirectory,
    openBrowser: !values.has("no-browser") && env.INTERVIEW_SENSEI_NO_BROWSER !== "1",
  };
}
