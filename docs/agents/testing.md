# Verification

This repository contains the harness and the application: a pnpm workspace on Node 24 and pnpm 12.
Run every command from the repository root after `pnpm install --frozen-lockfile`.

## Commands

- `pnpm check`: Prettier, oxlint with type checking, dependency-cruiser, Steiger and knip.
- `pnpm test`: the Vitest projects `unit` and `integration` of every workspace.
- `pnpm test:unit` or `pnpm test:integration`: one Vitest project.
- `pnpm build`: the built app into `apps/web/dist`: the web app in `web/` and a copy of `skills/` in `skills/`.
  The server runs from its sources and needs no build.
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
For the OpenCode version they put a stub `opencode` script into that PATH; it answers only `--version`.
For the OpenCode 2.x keys they create a made-up `opencode.db` with `node:sqlite` in that home.
A stub that hangs stands for a stuck OpenCode: the test runs the timeout task of the injected `Timer` by hand.
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
`INTERVIEW_SENSEI_FAKE_AGENT_MODE=mode-config-option` makes it offer its modes only as the config option `mode`, as OpenCode 2.x does.
In-process API tests listen on a free loopback port: the agent reaches the session's MCP address over real HTTP.
They send the page's `Host` and `Origin` from `browserHeaders` in `chat-test-support.ts`: the server refuses others.
`INTERVIEW_SENSEI_FAKE_AGENT_MODE=silent` makes it a hung agent; `ignore-sigterm` makes it ignore SIGTERM.

The fake agent has an interviewer mode for mock interviews (`fake-agent-interviewer.ts`).
It knows the server's template messages by their first sentence and answers them with our MCP tools, each after a permission request that the server allows.
On «The mock interview has started.» it calls `get_brief`, then shows the next question.
To show a question, it takes the first open candidate of `next_question_candidates`, or the first one, and calls `present_question`.
Right after that it sends «Подсказка до ответа: …» in the same turn; the browser must never get this hint.
On «The Candidate answered the presented question.» it replies «Ответ получен.» and calls `record_attempt`.
The Grade comes from the marker `[grade:N]` in the Candidate's answer, 2 without one; then it shows the next question.
The marker `[twice]` makes it call `record_attempt` once more and reply «Повторная запись: <tool result>».
Markers in the Candidate's answer steer it: `[followup]` makes it call `ask_follow_up` instead of `record_attempt`, and a refused Follow-up gives «Follow-up отклонён: <tool result>», then the Attempt.
`[quiz]` makes the next question the first quiz candidate, and `[deeper]` makes it a Deeper question in the same Topic with the recorded Attempt as its parent.
`[new]` makes it show a made-up question in the last Topic, and `[section]` calls `set_current_section` with the brief's next Section first.
On «The Candidate answered your Follow-up.» it replies «Уточнение получено.» and reads the same markers in that answer.
On a quiz result it replies «Квиз оценён: N.», on «Не знаю» «Вопрос пропущен.», then it shows the next question without `record_attempt`.
On «Five minutes of the time limit are left.» it replies «Осталось 5 минут: веду интервью к концу.».
On «The Candidate finished the mock interview.» it calls `finish_interview` and replies «Итог записан.».
A failed step ends the turn with «Фейковый интервьюер сломался: <error>».
Other prompts in a mock interview's chat, such as `/system` or `/tools`, get the replies above.
`interview-test-support.ts` in the server starts a mock interview on the demo Target and follows its socket and its chat.
`interview-flow-test-support.ts` adds `manualTime()`: a clock the test moves and a `Timer` whose tasks run only when the test fires them by delay, such as the reminder 25 minutes into a 30-minute limit.
`startServer` takes this clock and timer as options.

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
All e2e test files share that data directory, so only `e2e/tests/canvas.test.ts` creates Targets.
Its tests run in order: the first sees no Targets and opens the demo Target, the rest use it.
Each agent session works in its own directory under `sessions/` in the data directory.
The agents' own homes and configs live under `agents/` in the data directory, with symlinks to the Candidate's `auth.json`.
Claude Code is the exception (#24): it keeps the Candidate's config directory and writes its own state there.
One running server owns a data directory: a second server on it exits with code 1 and an error message.
Give each worktree its own data directory when several servers run at once.

## Fake agent

`pnpm test:e2e` offers the fake agent. To chat with it by hand, start `INTERVIEW_SENSEI_FAKE_AGENT=1 INTERVIEW_SENSEI_DATA_DIR=<temporary directory> pnpm dev`.
To check the built app by hand, run `pnpm build`, then the same variables with `pnpm start`.

## Launch command

`interview-sensei` (`apps/server/src/launch.ts`) serves `apps/web/dist/web` beside `/api` and prints the URL.
Its agents get the skills from `apps/web/dist/skills`; `pnpm dev` and in-process tests read the repository's `skills/`.
It logs only warnings and errors, so the URL line stays visible; `pnpm dev` logs every request.
Without the built web app or skills, it exits with code 1 and asks for `pnpm build`.
`INTERVIEW_SENSEI_WEB_DIR` and `INTERVIEW_SENSEI_SKILLS_DIR` replace these directories in tests.
It opens the URL with `open` on macOS, `rundll32 url.dll,FileProtocolHandler` on Windows and `xdg-open` elsewhere.
Tests and CI turn the browser off with `--no-browser` or `INTERVIEW_SENSEI_NO_BROWSER=1`.

## CI

`harness-check` (`.github/workflows/check.yml`) runs the structural checker and the whitespace check.
`app-check`, `app-test` and `app-e2e` (`.github/workflows/app.yml`) run `pnpm check`, `pnpm test` and `pnpm test:e2e`.
`deps-audit` and `secrets-scan` (`.github/workflows/security.yml`) check dependencies and Git history.

- `deps-audit` runs `pnpm audit --audit-level high` on `pnpm-lock.yaml` without an install.
  High and critical advisories fail it; low and moderate ones only appear in the log.
  The owner chose this threshold in #30.
  Run the same check locally with `pnpm audit --audit-level high`.
- `secrets-scan` runs gitleaks on every commit reachable from the checked-out commit.
  On a pull request, that commit is the merge with `main`.
  The workflow pins the gitleaks version and its archive checksum.
  `.gitleaksignore` lists the findings that are not secrets, one fingerprint per line with a reason above it.
  A real secret that reaches `main` fails every later run: rotate it, then remove it from history.
  Add a finding to `.gitleaksignore` only when it is not a secret.
  Run the same scan locally with `gitleaks git --log-opts="--full-history HEAD" --redact`.

Repository protection settings are not implied by these jobs.

## Appropriate evidence

For documentation or metadata changes, run structural checks and obtain independent review.
Check the meaning of Russian text and owner actions during review; a link checker cannot do that.
For changed checker or lint-rule behavior, exercise a clean case and a case that should fail.
Record the observed failure and successful result rather than adding tests for prose wording.
For new executable behavior, add suitable regression tests as part of that issue.

Keep private transcripts and personal interview data outside the public repository.
A static pass does not establish live-agent adherence, semantic translation parity or product correctness.
