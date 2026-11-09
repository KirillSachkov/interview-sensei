# Verification

This repository contains the harness and the application: a pnpm workspace on Node 24 and pnpm 12.
Run every command from the repository root after `pnpm install --frozen-lockfile`.

## Commands

- `pnpm check`: Prettier, oxlint with type checking, dependency-cruiser, Steiger and knip.
- `pnpm test`: the Vitest projects `unit` and `integration` of every workspace.
- `pnpm test:unit` or `pnpm test:integration`: one Vitest project.
- `pnpm build`: the web app into `apps/web/dist`; the server runs from its sources and needs no build.
- `pnpm test:e2e`: `pnpm build`, then Playwright in Chromium against the `interview-sensei` command that it starts itself.
  Only the root script builds first; `pnpm --filter @interview-sensei/e2e test:e2e` tests the existing `apps/web/dist`.
- `pnpm verify`: `pnpm check`, `pnpm test`, `pnpm test:e2e` and `python3 scripts/check.py` in order.
- `python3 scripts/check.py`: local Markdown links/anchors, own skill identity and invocation metadata, directory hashes, package skill links and client pointers.
- `git diff --check`: whitespace errors in the change.
- `pnpm --filter @interview-sensei/core db:generate --name <name>`: drizzle-kit migrations for every core slice with `infrastructure/drizzle.config.ts`.

Before a PR, run `pnpm verify` and `git diff --check` and report their actual results.
Install the Playwright browser once with `pnpm --filter @interview-sensei/e2e exec playwright install chromium`.

## Test levels

| Level       | File                                  | Runs                                                                 |
| ----------- | ------------------------------------- | -------------------------------------------------------------------- |
| unit        | `src/**/*.test.ts` next to the code; core domain tests at the slice root | Pure functions; no I/O, no server. `domain-is-pure` keeps tests out of `domain/`. |
| integration | `apps/server/src/**/*.int.test.ts`    | The server in process through its HTTP API, or `src/main.ts` and `src/launch.ts` as processes. |
| integration | `packages/core/src/**/*.int.test.ts`  | Core technical code on real infrastructure: PGlite, files, agent discovery and the fake ACP agent as a process, in temporary directories. |
| e2e         | `e2e/tests/*.test.ts`                 | The real browser against the built app that `interview-sensei` serves. |

Test external behavior at the public boundary, not implementation details.
Name each test after the behavior it checks.
Integration tests use real infrastructure in process, without Docker.
Pass time through the injected `Clock`; never fake `Date` globally.
Pass repeated and delayed work through the injected `Timer`; tests run its tasks by hand instead of sleeping.
Give each test its own temporary data directory and remove it when the test finishes.
Tests never call real agents: they need subscriptions.
Tests use the fake ACP agent instead: `buildServer({ fakeAgent: true })` in process, `INTERVIEW_SENSEI_FAKE_AGENT=1` for `src/main.ts`.
With the fake agent the server offers only it and never looks into the real home.
Without it the server offers Claude Code, Codex and OpenCode from `userEnvironment`; `run-server.ts` passes the real home and env.
[Storage](../../CODING_STANDARDS.md#storage) in the coding standards owns what the agents get from that environment.
The fake agent gets an empty environment plus its recipe's variables.
Tests that check the real agents' availability pass a temporary directory as `userEnvironment.home` and PATH, and start no real agent.
Launch recipes are pure: unit tests give them made-up paths, profiles and skills, and nothing touches the disk.
Unit tests give `opencodeModelSettings` made-up texts; a missing or invalid file gives no model.
The fake agent streams a reply in chunks; the prompt `/wait` waits for a cancel, `/fail` answers with a JSON-RPC error, and `/crash` exits with code 1.
`/brief` calls `get_brief` on the session's MCP address after a permission request that the server allows by itself.
`/permission` asks permission for a foreign tool and replies with the Candidate's choice; `/mcp` replies with the session's MCP server name and address.
`/late` asks permission after its turn ends and sends the outcome it gets, which is `cancelled`.
A new fake session starts in the mode `candidate-mode`, which stands for the Candidate's own mode; `/mode` replies with the current mode and `/meta` with the `_meta` of `session/new`.
`/env` replies with the names of the fake agent's environment variables.
`/system` replies with the role from the ACP `systemPrompt` of `session/new`, `/skills` with the skills in `.agents/skills` of its `additionalDirectories`, and `/tools` with the bans from `_meta.fakeAgent.disallowedTools`.
`INTERVIEW_SENSEI_FAKE_AGENT_MODE=no-session-capabilities` makes it take neither a system prompt nor additional directories.
In-process API tests listen on a free loopback port: the agent reaches the session's MCP address over real HTTP.
They send the page's `Host` and `Origin` from `browserHeaders` in `chat-test-support.ts`: the server refuses others.
`INTERVIEW_SENSEI_FAKE_AGENT_MODE=silent` makes it a hung agent; `ignore-sigterm` makes it ignore SIGTERM.

## Ports

`pnpm dev` uses server port 4310 and web port 5173; set `SERVER_PORT` and `WEB_PORT` to change them.
`pnpm start` uses port 4310 too and serves the web app on it; set `SERVER_PORT` to change it.
`pnpm test:e2e` uses port 4320; set `E2E_SERVER_PORT` to change it.
A server on a taken port exits with code 1 and a message that names the port.
Give each worktree its own ports when several run at once.
`SERVER_HOST` takes only loopback hosts; [local requests](../../CODING_STANDARDS.md#local-requests) owns the rule.

## Data directory

The server keeps all data in `~/.interview-sensei`; the `INTERVIEW_SENSEI_DATA_DIR` variable overrides it.
`pnpm dev` and `pnpm start` use the default directory.
`pnpm test:e2e` uses `e2e/.data`, which Git ignores; its webServer command empties it before each run.
Each agent session works in its own directory under `sessions/` in the data directory.
The agents' own homes and configs live under `agents/` in the data directory, with symlinks to the Candidate's `auth.json`.
Claude Code is the exception (#24): it keeps the Candidate's config directory and writes its own state there.
One running server owns a data directory: a second server on it exits with code 1 and an error message.
Give each worktree its own data directory when several servers run at once.

## Fake agent

`pnpm test:e2e` offers the fake agent. To chat with it by hand, start `INTERVIEW_SENSEI_FAKE_AGENT=1 INTERVIEW_SENSEI_DATA_DIR=<temporary directory> pnpm dev`.
To check the built app by hand, run `pnpm build`, then the same variables with `pnpm start`.

## Launch command

`interview-sensei` (`apps/server/src/launch.ts`) serves `apps/web/dist` beside `/api` and prints the URL.
It logs only warnings and errors, so the URL line stays visible; `pnpm dev` logs every request.
Without a built web app, it exits with code 1 and asks for `pnpm build`.
`INTERVIEW_SENSEI_WEB_DIR` replaces `apps/web/dist` in tests.
It opens the URL with `open` on macOS, `rundll32 url.dll,FileProtocolHandler` on Windows and `xdg-open` elsewhere.
Tests and CI turn the browser off with `--no-browser` or `INTERVIEW_SENSEI_NO_BROWSER=1`.

## CI

`harness-check` (`.github/workflows/check.yml`) runs the structural checker and the whitespace check.
`app-check`, `app-test` and `app-e2e` (`.github/workflows/app.yml`) run `pnpm check`, `pnpm test` and `pnpm test:e2e`.
Repository protection settings are not implied by these jobs.

## Appropriate evidence

For documentation or metadata changes, run structural checks and obtain independent review.
Check the meaning of Russian text and owner actions during review; a link checker cannot do that.
For changed checker or lint-rule behavior, exercise a clean case and a case that should fail.
Record the observed failure and successful result rather than adding tests for prose wording.
For new executable behavior, add suitable regression tests as part of that issue.

Keep private transcripts and personal interview data outside the public repository.
A static pass does not establish live-agent adherence, semantic translation parity or product correctness.
