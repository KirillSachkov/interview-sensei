import { parseArgs } from "node:util";

import { launchPorts } from "./ports.ts";
import type { PortChoice } from "./ports.ts";
import { StartError } from "./start-error.ts";

/** The help text of the `interview-sensei` command. */
export const usage = `Использование: interview-sensei [--port <порт>] [--data-dir <каталог>] [--no-browser]

  --port <порт>         Порт сервера. Если он занят, приложение завершается.
                        Без флага приложение берёт 4310 или следующий свободный порт.
  --data-dir <каталог>  Каталог данных вместо ~/.interview-sensei.
  --no-browser          Не открывать браузер.
  --help                Показать эту справку.
`;

/** What the command line and the environment ask the `interview-sensei` command to do. */
export interface LaunchOptions {
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

/** Checks every argument itself, so its errors are in Russian and name the argument. */
function checkArguments(args: readonly string[]): void {
  const { tokens } = parseArgs({
    args: [...args],
    options: flags,
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  for (const token of tokens) {
    if (token.kind === "positional") {
      throw new StartError(`Лишний аргумент «${token.value}».`);
    }
    if (token.kind === "option") {
      if (!Object.hasOwn(flags, token.name)) {
        throw new StartError(`Неизвестный флаг ${token.rawName}.`);
      }
      if (flagsWithValue.has(token.name) && token.value === undefined) {
        throw new StartError(`Флагу ${token.rawName} нужно значение.`);
      }
    }
  }
}

/**
 * Reads the flags `--port`, `--data-dir`, `--no-browser` and `--help`. The variables SERVER_PORT
 * and INTERVIEW_SENSEI_NO_BROWSER=1 work as before; a flag goes over its variable. Throws
 * StartError for an unknown flag, a missing value or a wrong port.
 */
export function launchOptions({
  args,
  env,
}: {
  args: readonly string[];
  env: NodeJS.ProcessEnv;
}): LaunchOptions {
  checkArguments(args);
  const { values } = parseArgs({ args: [...args], options: flags, strict: true });
  if (values["data-dir"] === "") {
    throw new StartError("Флагу --data-dir нужен непустой путь.");
  }
  return {
    help: values.help === true,
    port: launchPorts(values.port, env),
    dataDirectory: values["data-dir"],
    openBrowser: values["no-browser"] !== true && env.INTERVIEW_SENSEI_NO_BROWSER !== "1",
  };
}
