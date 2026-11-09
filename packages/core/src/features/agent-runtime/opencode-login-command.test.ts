// The application's own OpenCode 2.x login (#69): the command that `interview-sensei login
// opencode` runs. The machine is made up; nothing runs OpenCode.
import { describe, expect, it } from "vitest";

import { opencodeLoginCommand } from "./domain/opencode-login.ts";
import { dataDirectory, host, opencodeVersions } from "./launch-recipe-test-support.ts";

const own = `${dataDirectory}/agents/opencode`;

describe("opencode login command", () => {
  it("runs OpenCode's login with a private server in the application's OpenCode homes", () => {
    expect(opencodeLoginCommand(host, { dataDirectory, env: {} })).toStrictEqual({
      type: "run",
      command: "/opt/homebrew/bin/opencode",
      args: ["auth", "login", "--standalone"],
      cwd: own,
      env: {
        XDG_CONFIG_HOME: `${own}/config`,
        XDG_DATA_HOME: `${own}/data-2`,
        XDG_STATE_HOME: `${own}/state`,
        XDG_CACHE_HOME: `${own}/cache`,
        OPENCODE_DISABLE_CLAUDE_CODE: "1",
        OPENCODE_DISABLE_PROJECT_CONFIG: "1",
      },
    });
  });

  it("keeps the Candidate's variables but none that points OpenCode at the Candidate's own files", () => {
    const login = opencodeLoginCommand(host, {
      dataDirectory,
      env: {
        PATH: "/usr/bin",
        OPENCODE_DB: "/home/candidate/other.db",
        OPENCODE_CONFIG: "/home/candidate/opencode.json",
        XDG_DATA_HOME: "/home/candidate/.local/share",
        INTERVIEW_SENSEI_DATA_DIR: dataDirectory,
      },
    });
    expect(login).toMatchObject({ env: { PATH: "/usr/bin", XDG_DATA_HOME: `${own}/data-2` } });
    expect(login).not.toHaveProperty("env.OPENCODE_DB");
    expect(login).not.toHaveProperty("env.OPENCODE_CONFIG");
    expect(login).not.toHaveProperty("env.INTERVIEW_SENSEI_DATA_DIR");
  });

  it("refuses OpenCode 1.x: it would write the login through the link to the Candidate's auth.json", () => {
    expect(
      opencodeLoginCommand(
        { ...host, opencodeVersion: opencodeVersions.v1 },
        { dataDirectory, env: {} },
      ),
    ).toStrictEqual({
      type: "refused",
      reason:
        "OpenCode 1.18.30 не нуждается во входе для приложения: сессии используют ваш вход в OpenCode. Отдельный вход нужен только OpenCode 2.x.",
    });
  });

  it("refuses an OpenCode whose version it does not know", () => {
    expect(
      opencodeLoginCommand({ ...host, opencodeVersion: null }, { dataDirectory, env: {} }),
    ).toStrictEqual({
      type: "refused",
      reason:
        "Не удалось узнать версию OpenCode: команда `opencode --version` не ответила. Проверьте, что OpenCode запускается.",
    });
  });

  it("refuses without OpenCode in PATH", () => {
    expect(
      opencodeLoginCommand({ ...host, opencodeBinary: null }, { dataDirectory, env: {} }),
    ).toStrictEqual({
      type: "refused",
      reason: "OpenCode не установлен: команда `opencode` не найдена в PATH.",
    });
  });
});
