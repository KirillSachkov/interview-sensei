# Verification

This repository contains the harness and the application: a pnpm workspace on Node 24 and pnpm 12.
Run every command from the repository root after `pnpm install --frozen-lockfile`.

## Commands

- `pnpm check`: Prettier, oxlint with type checking, dependency-cruiser, Steiger and knip.
- `pnpm test`: the Vitest projects `unit` and `integration` of every workspace.
- `pnpm test:unit` or `pnpm test:integration`: one Vitest project.
- `pnpm test:e2e`: Playwright in Chromium; it starts the server and the web dev server itself.
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
| integration | `apps/server/src/**/*.int.test.ts`    | The server in process through its HTTP API, or `src/main.ts` as a process. |
| integration | `packages/core/src/**/*.int.test.ts`  | Core technical code on real PGlite in a temporary data directory.    |
| e2e         | `e2e/tests/*.test.ts`                 | The real browser against the running server and web app.             |

Test external behavior at the public boundary, not implementation details.
Name each test after the behavior it checks.
Integration tests use real infrastructure in process, without Docker.
Pass time through the injected `Clock`; never fake `Date` globally.
Pass repeated work through the injected `Timer`; tests tick it by hand instead of sleeping.
Give each test its own temporary data directory and remove it when the test finishes.
Tests never call real agents: they need subscriptions.
Tests use the fake ACP agent instead: `buildServer({ fakeAgent: true })` in process, `INTERVIEW_SENSEI_FAKE_AGENT=1` for `src/main.ts`.
The fake agent streams a reply in chunks; the prompt `/wait` waits for a cancel, `/fail` answers with a JSON-RPC error, and `/crash` exits with code 1.

## Ports

`pnpm dev` uses server port 4310 and web port 5173; set `SERVER_PORT` and `WEB_PORT` to change them.
`pnpm test:e2e` uses 4320 and 5183; set `E2E_SERVER_PORT` and `E2E_WEB_PORT` to change them.
Give each worktree its own ports when several run at once.

## Data directory

The server keeps all data in `~/.interview-sensei`; the `INTERVIEW_SENSEI_DATA_DIR` variable overrides it.
`pnpm dev` uses the default directory. `pnpm test:e2e` uses `e2e/.data`, which Git ignores.
Each agent session works in its own directory under `sessions/` in the data directory.
One running server owns a data directory: a second server on it exits with code 1 and an error message.
Give each worktree its own data directory when several servers run at once.

## Fake agent

`pnpm test:e2e` offers the fake agent. To chat with it by hand, start `INTERVIEW_SENSEI_FAKE_AGENT=1 INTERVIEW_SENSEI_DATA_DIR=<temporary directory> pnpm dev`.

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
