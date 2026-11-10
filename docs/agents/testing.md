# Verification

This repository contains the harness and the application: a pnpm workspace on Node 24 and pnpm 12.
Run every command from the repository root after `pnpm install --frozen-lockfile`.

## Commands

- `pnpm check`: Prettier, oxlint with type checking, dependency-cruiser, Steiger and knip.
- `pnpm test`: the Vitest projects `unit` and `integration` of every workspace.
- `pnpm test:unit` or `pnpm test:integration`: one Vitest project.
- `pnpm build`: the built app into `apps/web/dist`: the web app in `web/` and a copy of `skills/` in `skills/`.
  Then the npm package `interview-sensei` into `apps/server/dist/package`; see [npm package](#npm-package).
  The server in the repository runs from its sources and needs no build.
- `pnpm test:e2e`: `pnpm build`, then Playwright in Chromium against the `interview-sensei` command that it starts itself.
  Only the root script builds first; `pnpm --filter @interview-sensei/e2e test:e2e` tests the existing `apps/web/dist`.
- `pnpm test:package`: `pnpm build`, then the Vitest project `package` of `apps/server` against the packed npm package.
  npm downloads the package's dependencies, so the command needs the network.
- `pnpm verify`: `pnpm check`, `pnpm test`, `pnpm test:e2e`, the Vitest project `package` and `python3 scripts/check.py` in order.
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
| package     | `apps/server/src/**/*.package.test.ts` | The packed npm package installed by npm into a temporary directory, started with the fake agent. |

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
`login.int.test.ts` runs `interview-sensei login opencode` with a stub that also records the login it was asked to run.
For the OpenCode 2.x keys they create a made-up `opencode.db` with `node:sqlite` in that home.
A stub that hangs stands for a stuck OpenCode: the test runs the timeout task of the injected `Timer` by hand.
Launch recipes are pure: unit tests give them made-up paths, profiles and skills, and nothing touches the disk.
Unit tests give `opencodeModelSettings` made-up texts; a missing or invalid file gives no model.
The fake agent streams a reply in chunks; the prompt `/wait` waits for a cancel, `/fail` answers with a JSON-RPC error, and `/crash` exits with code 1.
`/brief` calls `get_brief` on the session's MCP address after a permission request that the server allows by itself.
`/tool <name> <json>` calls any tool of the session's MCP address the same way, with the JSON object as its arguments.
It replies «Результат <name>: <text>», or «Ошибка <name>: <text>» when the tool reports an error, in one chunk: a long brief costs no pause per word.
API tests drive an agent's work with our tools this way, such as `/tool update_target {"name":"Go"}` in a Target setup session.
`/permission` asks permission for a foreign tool and replies with the name of the Candidate's choice.
It offers one option of each ACP kind, named in English as real agents name them, such as «Allow once»; the page names them by kind.
`/mcp` replies with the session's MCP server name and address.
`/markdown` replies with Markdown, raw HTML, a `javascript:` link and a remote image, so a test checks how the chat shows the agent's text.
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
When `next_question_candidates` refuses, it replies «Кандидаты не получены: <tool result>» and shows no question.
On «The Candidate answered the presented question.» it replies «Ответ получен.» and calls `record_attempt`.
The Grade comes from the marker `[grade:N]` in the Candidate's answer, 2 without one; then it shows the next question.
For a question with a reference answer it counts the key points in the result of `present_question`, or in the brief's `presentedQuestion` after a pause, and covers all of them, or those of the marker `[covered:1,3]`.
`[disagree]` adds its disagreement with the reference answer, «Фейковый интервьюер не согласен с опорным ответом.».
The marker `[twice]` makes it call `record_attempt` once more and reply «Повторная запись: <tool result>».
Markers in the Candidate's answer steer it: `[followup]` makes it call `ask_follow_up` instead of `record_attempt`, and a refused Follow-up gives «Follow-up отклонён: <tool result>», then the Attempt.
`[quiz]` makes the next question the first quiz candidate, and `[deeper]` makes it a Deeper question in the same Topic with the recorded Attempt as its parent.
`[new]` makes it show a made-up question in the last Topic, with a reason, and `[section]` calls `set_current_section` with the brief's next Section first.
`[last]` makes it show no next question, so its replies to chat messages reach the chat.
On «The Candidate answered your Follow-up.» it replies «Уточнение получено.» and reads the same markers in that answer.
On a quiz result it replies «Квиз оценён: N.», on «Не знаю» «Вопрос пропущен.», then it shows the next question without `record_attempt`.
On «Five minutes of the time limit are left.» it replies «Осталось 5 минут: веду интервью к концу.».
On «The Candidate finished the mock interview.» it calls `finish_interview` and replies «Итог записан.».
A failed step ends the turn with «Фейковый интервьюер сломался: <error>».
Other prompts in a mock interview's chat, such as `/system` or `/tools`, get the replies above.
`interview-test-support.ts` in the server starts a mock interview on the demo Target and follows its socket and its chat.
`interview-flow-test-support.ts` adds `manualTime()`: a clock the test moves and a `Timer` whose tasks run only when the test fires them by delay, such as the reminder 25 minutes into a 30-minute limit.
`startServer` takes this clock and timer as options.
A test runs the 2-minute wait for `finish_interview` with that timer; `/wait` in the interviewer chat keeps the message that the Candidate finished from the agent.
`/crash` in the interviewer chat pauses the mock interview.
On «The mock interview continues after a pause.» it calls `get_brief` and reads the presented question of its continuation.
One that waits for an answer gets «Продолжаем после паузы: жду ответа.», which the browser must never get.
An answered one gets «Продолжаем после паузы.» and the Attempt by the answer's markers; without one it says «Продолжаем после паузы.» and shows the next question, unless the last answer had `[last]`.
`pause-test-support.ts` posts «Пауза» and «Продолжить».
A test of an unavailable agent stores Codex as the agent of a paused mock interview through the storage of a stopped server: a test cannot start a mock interview with a real agent.

The fake agent also has an Inbox processor mode (`fake-agent-inbox.ts`) for the opening «Inbox processing has started.».
It reads `get_brief` and `list_inbox`, puts one Question per part into the first Topic of the first Section of kind `topics` (creating «Из материалов» when there is none), and writes the Inbox report.
A material whose title has `[manual]` makes it stop at «Жду команд.», so an API test drives the processing with `/tool` in the processing session's chat.
On «Recheck of the question bank has started.» (`fake-agent-recheck.ts`) it reads `get_brief` and writes the Inbox report with every visible Question in `proposals.hide`, the first active Preference in each reason.
A Preference with `[manual]` makes the recheck stop at «Жду команд.» the same way.
`inbox-test-support.ts` starts a processing, finds its session and waits for the fake processor's first turn; `material-test-support.ts` makes a PDF, a DOCX and a web page on a local HTTP server, so no test needs the network.
The server reads the texts and starts the agent in the background, so the tests wait for them with `vi.waitFor`.
`/wait` and `/crash` in the processing session's chat keep its agent in a turn and make it fail, for the tests of «Остановить разбор» and of a failed agent.
After a turn without the Inbox report the server waits 2 minutes on its `Timer`, then closes the processing: the default timer of `startServer` never runs it, so `/tool` keeps driving a `[manual]` agent, and a test of that close passes `manualTime()` and fires the wait.
A test of a restart stops the server and starts another one on the same data directory, as the Mock interview tests do.
The fake agent streams a reply word by word, but the result of `/tool` comes in one chunk, so `read_source` gives a long text as it is.

The fake agent has an answer search mode (`fake-agent-answers.ts`) for the opening «Answer search has started.».
It sends a `usage_update` of 4321 tokens in a context of 200000, takes the queue five Questions at a time with `next_questions_without_answer`, and writes an answer «из интернета» with a link to example.com for the first Question of each batch and for one «из знаний агента», and «из знаний агента» for the others.
A refused save goes to `failed` of its `write_answer_report` with the tool's error.
A Target whose name has `[manual]` makes it stop at «Жду команд.», so an API test drives the search with `/tool`; `answer-test-support.ts` makes such a Target with `manualTarget` and starts its search with `manualSearch`.
`/usage <tokens>` in any session sends a `usage_update` with these tokens in a context of 200000 and replies «Расход: <tokens>», for the report's token usage.
`/wait`, `/crash` and the 2-minute wait on `manualTime()` end an answer search as they end an Inbox processing.
`answer-background.int.test.ts` turns «Наполнять в фоне» on with `PUT /api/settings/fill-in-background`.
A test that no background search started stops the server, whose close waits for background work, and reads the Target on a new server on the same data directory: a search started before would have left a report.

The fake agent has a side thread mode for Side threads (`fake-agent-side-thread.ts`).
On «The Candidate opened a side thread from a mock interview.» it calls `get_brief` and replies «Разбираю вопрос кандидата: «<candidateQuestion>»».
A failed step there ends the turn with «Фейковый агент ветки сломался: <error>».
On «The side thread continues in a new session.» it calls `get_brief` and replies «Продолжаю ветку: N сообщения до перерыва», where N counts the messages of the brief's `continuation`.
`/brief` in the Side thread's chat replies with the whole Handoff brief as JSON.
`/tool-list` replies with the sorted names of the session's MCP tools: «MCP tools: <json>».
A prompt that starts with the server's note «The Candidate discussed question N in a side thread.» first gets «Отметка: <note>», then the reply to the rest.
`side-thread-test-support.ts` in the server opens a Side thread at a question card, an interviewer message or a Debrief and follows its chat.
An interviewer message has the id of its chat entry, such as `agent-12`; `[last]` in the answer keeps «Ответ получен.» in the chat for it.
`api.debrief` in the tests only reads the Debrief; `POST /api/interviews/:id/attempts/:attemptId/debrief-opened` records that the Candidate opened it.

## Ports

`pnpm dev` uses server port 4310 and web port 5173; set `SERVER_PORT` and `WEB_PORT` to change them.
`pnpm start` serves the web app on port 4310; when 4310 is taken, it takes the next free port up to 4319.
Set `--port` or `SERVER_PORT` to choose the port; a chosen port that is taken stops the command with code 1.
`pnpm dev` never moves to another port: Vite forwards `/api` to exactly 4310 or `SERVER_PORT`.
`pnpm test:e2e` uses port 4320; set `E2E_SERVER_PORT` to change it.
A server on a taken port exits with code 1 and a message that names the port.
Give each worktree its own ports when several run at once.
`SERVER_HOST` takes only loopback hosts; [local requests](../../CODING_STANDARDS.md#local-requests) owns the rule.

## Data directory

The server keeps all data in `~/.interview-sensei`; the `INTERVIEW_SENSEI_DATA_DIR` variable overrides it.
`pnpm dev` and `pnpm start` use the default directory; `pnpm start --data-dir <directory>` uses another one.
`pnpm test:e2e` uses `e2e/.data`, which Git ignores; its webServer command empties it before each run.
All e2e test files share that data directory, so only `e2e/tests/canvas.test.ts` creates Targets.
Its tests run in order: the first sees no Targets and opens the demo Target, the rest use it.
`answerTests` of `e2e/tests/answer-tests.ts` declares the test of the Debrief's Reference answer from `answer-debrief-tests.ts`: it fills answers of the demo Target before the mock interview tests run.
Tests that need this order and live in another module, such as the mock interview tests of `e2e/tests/mock-interview-tests.ts` and the Side thread tests of `e2e/tests/side-thread-tests.ts`, are declared by a function that `canvas.test.ts` calls.
Each agent session works in its own directory under `sessions/` in the data directory.
A Target keeps the files of its materials under `targets/<Target id>/sources/`, one directory per Source.
The agents' own homes and configs live under `agents/` in the data directory, with symlinks to the Candidate's `auth.json` for Codex and OpenCode 1.x.
OpenCode 2.x keeps its data, the application's own login among it, in `agents/opencode/data-2` (#69).
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
Its flags are `--port`, `--data-dir`, `--no-browser` and `--help`; `launch-options.ts` reads them, and a flag goes over its variable.
`interview-sensei login opencode` runs the application's own OpenCode 2.x login instead of the server; it needs no built app.
An unknown flag or a wrong port stops it with code 1 and the help text.

## npm package

`apps/server/scripts/build-package.ts` builds the package that `npx interview-sensei` runs.
Rolldown compiles `launch.ts` and the fake agent with every module they import into JavaScript, one file per source file.
The package keeps the repository layout, so paths from `import.meta.dirname` hold: the migrations, the fake agent and `apps/web/dist`.
Core is part of the package; other imports stay dependencies with the exact versions from the server and core manifests.
The build fails when the code imports a package that neither manifest lists.
The package declares Node 22.15 or newer; the server reads `node:sqlite` only for OpenCode 2.x keys.
The package tests pack it, install the file with npm into a temporary directory and start its `interview-sensei` with the fake agent.
They run the package with the Node that runs Vitest; CI runs them on Node 22.15.0, the newest 22 and 24.

## CI

`harness-check` (`.github/workflows/check.yml`) runs the structural checker and the whitespace check.
`app-check`, `app-test` and `app-e2e` (`.github/workflows/app.yml`) run `pnpm check`, `pnpm test` and `pnpm test:e2e`.
`app-package` builds the package on Node 24 and runs the Vitest project `package` on each Node of its matrix.
`publish` (`.github/workflows/release.yml`) publishes the npm package; [release](#release) describes it.
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

## Release

`publish` (`.github/workflows/release.yml`) runs on a tag `v<version>` that matches `apps/server/package.json`.
It runs `pnpm check`, `pnpm test` and `pnpm test:package`, then `npm publish --provenance` by npm trusted publishing.
Only the owner pushes a release tag and approves the `npm` deployment.
Agents never push a release tag and never approve or reject the deployment.
Two repository settings back this rule:

- The environment `npm` runs `publish` only from `v*` tags and waits for the owner's approval.
  Admins cannot bypass the approval.
- The ruleset «Release tags» (id `26859563`) lets only the admin role create, update or delete `v*` tags.

Agents work under the owner's GitHub account, which has the admin role.
So the settings stop collaborators without the admin role, not agents; the rule above stops agents.

A release takes three steps:

1. A PR raises `version` in `apps/server/package.json`, and the owner merges it.
2. The owner pushes the tag `v<version>` on that commit of `main`.
3. The owner approves the `npm` deployment of the `Release` run in GitHub Actions.

npm refuses a version that exists. So a tag for the current version, such as `v0.1.0`, passes the checks and fails at `npm publish`.

npm links a trusted publisher only to a package that already exists.
So version `0.1.0` was published by hand from `apps/server/dist/package` with the owner's 2FA confirmation (#67).
Then `npm trust github` linked the package to `release.yml` and the environment `npm`.
The first publish left the npm placeholder version `0.0.0-stage`; the tag `latest` points to `0.1.0`.
A publish by hand needs two-factor authentication on the owner's npm account; `release.yml` publishes through OIDC instead.

## Appropriate evidence

For documentation or metadata changes, run structural checks and obtain independent review.
Check the meaning of Russian text and owner actions during review; a link checker cannot do that.
For changed checker or lint-rule behavior, exercise a clean case and a case that should fail.
Record the observed failure and successful result rather than adding tests for prose wording.
For new executable behavior, add suitable regression tests as part of that issue.

Keep private transcripts and personal interview data outside the public repository.
A static pass does not establish live-agent adherence, semantic translation parity or product correctness.
