# Verification

This repository contains the harness and the application: a pnpm workspace on Node 24 and pnpm 12.
Run every command from the repository root after `pnpm install --frozen-lockfile`.

## Commands

- `pnpm check`: Prettier, oxlint with type checking, dependency-cruiser, Steiger and knip.
- `pnpm test`: the Vitest projects `unit` and `integration` of every workspace.
- `pnpm test:unit` or `pnpm test:integration`: one Vitest project.
- `pnpm test:e2e`: Playwright in Chromium; it starts the server and the web dev server itself.
- `pnpm verify`: `pnpm check`, `pnpm test`, `pnpm test:e2e` and `python3 scripts/check.py` in order.
- `python3 scripts/check.py`: local Markdown links/anchors, skill identity and invocation metadata, directory hashes and client pointers.
- `git diff --check`: whitespace errors in the change.

Before a PR, run `pnpm verify` and `git diff --check` and report their actual results.
Install the Playwright browser once with `pnpm --filter @interview-sensei/e2e exec playwright install chromium`.

## Test levels

| Level       | File                                  | Runs                                                                 |
| ----------- | ------------------------------------- | -------------------------------------------------------------------- |
| unit        | `src/**/*.test.ts` next to the code   | Pure functions; no I/O, no server.                                   |
| integration | `apps/server/src/**/*.int.test.ts`    | The server built in process, called through its HTTP API.            |
| e2e         | `e2e/tests/*.test.ts`                 | The real browser against the running server and web app.             |

Test external behavior at the public boundary, not implementation details.
Name each test after the behavior it checks.
Integration tests use real infrastructure in process, without Docker.
Pass time through the injected `Clock`; never fake `Date` globally.
Tests never call real agents: they need subscriptions.

## Ports

`pnpm dev` uses server port 4310 and web port 5173; set `SERVER_PORT` and `WEB_PORT` to change them.
`pnpm test:e2e` uses 4320 and 5183; set `E2E_SERVER_PORT` and `E2E_WEB_PORT` to change them.
Give each worktree its own ports when several run at once.

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
