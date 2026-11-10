# Review standards

This document guides the Standards reviewer for this repository.
Root `AGENTS.md` owns authority and scope.

## Application code

The stack is TypeScript on Node 24 in a pnpm workspace; NestJS is not used.
The npm package `interview-sensei` runs on Node 22.15 or newer, so server and core code use only APIs that Node 22.15 has.

| Workspace       | Role                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `apps/server`   | Fastify server: composes core features, serves HTTP under `/api` and the built web app; the `interview-sensei` command. |
| `apps/web`      | React, Vite, TanStack Router and Query, Feature-Sliced Design.                |
| `packages/core` | Feature slices in `src/features/<feature>/` and technical code in `src/shared/`. |
| `e2e`           | Playwright tests against the built app that `interview-sensei` serves.        |
| `skills/`       | Skills the application gives the Candidate's agent, one per session kind; not a workspace. |

Shared settings live in `config/`: TypeScript, oxlint with the project plugin, and the dependency-cruiser base.

### Core feature slices

A feature slice has the layers `domain/`, `application/` and `infrastructure/`; create a layer when it gets code.
`domain/` is plain TypeScript and imports only the `domain/` of its own feature.
`domain-is-pure` checks test files too, so unit tests of domain code sit at the slice root.
`application/` uses domain ports and receives infrastructure as parameters.
Technical ports such as `Clock` live in `src/shared/`; application code may use them too.
Slices never import each other. `src/shared/` is technical and never imports slices.
When a slice needs another slice, it defines a port in its `domain/`, and the server passes the other slice in; `agent-sessions` gets `agent-runtime` and `mcp-gateway` this way.

### References between slices

Store cross-slice references as ids, without foreign keys between Postgres schemas.
A slice reads only its own schema and validates references through a domain port supplied by the server.
For example, `targets` stores ordered Topic ids on a Section.
Its `TargetTopics` port lists the Target's Topics; the service rejects a Topic outside that Target before saving the Section.
`composeFeatures` supplies `question-bank` as that port.
`targets` accepts only an agent that its `TargetAgents` port offers; `composeFeatures` supplies `agent-runtime` as that port.
In the opposite direction, `search_questions` resolves a Section's Topic ids through its `SectionTopics` port, scoped to the session's Target.
Within a slice, use database constraints for relationships: `question-bank` ties each Question to a Topic of the same Target.

### Composition

Each slice exports one module factory from `module.ts` at the slice root, such as `mcpGatewayModule`.
The factory takes only what the server owns: database, clock, timer, data directory, callbacks and other slices' services.
It creates the slice's infrastructure itself and returns the slice's service.
The slice's `index.ts` exports the factory, its migrations, its MCP tools and the types of its service.
It also exports the constants, errors and dependency types that the server needs, such as `SessionsClosedError`.
It does not export application or infrastructure parts.
`agent-runtime` also exports `opencodeLoginModule` for `interview-sensei login opencode` (#69): that command runs without a server, storage or lock.

`apps/server/src/composition.ts` and its parts `composition-<part>.ts` are the only server files that import core features; `server-composes-features-in-one-module` checks it.
A part keeps `composition.ts` within the lint limits on lines and imports; only `composition.ts` imports a part.
`composeFeatures` opens the storage and calls each factory once.
Routes take composed services and their types from `composition.ts`.
Shared subpaths, such as `time`, `storage` and `session-kinds`, stay open to every server file.

The session kinds live in `packages/core/src/shared/session-kinds` (`@interview-sensei/core/session-kinds`).
A request types the kind as `SessionKind` on entry; storage keeps it as a string.
`agent-sessions` treats a kind as an opaque label, as it treats the agent.
A new slice plugs in like this:

1. Write its module factory and export it from `index.ts`.
2. Add one call of the factory to `composeFeatures` in `composition.ts`.
3. Add its migrations to `sliceMigrations` there, when it stores data.
4. Add its MCP tools to its session kinds in `sessionTools` there.
5. For a new session kind, follow [session profiles](#session-profiles).

The gateway reads a tool set when a session starts, after `composeFeatures` has built every service.
So a tool set may use services built after the gateway, such as `interviews`: `sessionTools` reads them in a getter, and `bind` hands them over.
`progress` counts the Attempts of `interviews`, and the brief of `interviews` reads `progress` back.
`composeInterviews` gives `interviews` a function that calls `progress`, which exists by the first call.
A Topic merge in a draft of changes moves the merged Topic's Attempts through `interviews` in the same transaction, so Topic status counts them under the Topic that stays.
`topicMerges` gives `target-setup` this port the same way: `interviews` exists by the first application of a draft.
`src/shared/background-work` holds what Inbox processing and answer search share: `availableAgent`, `inBackground` and `endAfterTurn`.
Inbox processing in `sources` starts its agent through `agent-sessions`, which composeFeatures builds after `sources`: `inboxSessions` hands it over the same way.
`add_bank_questions` of `sources` leaves out duplicates by the rule of `add_questions` (#45): `target-setup` exports `withoutDuplicates`, and composeFeatures passes it to `sources` as its `DuplicateFilter` port.
`create_topic` of `sources` creates the Topic through `question-bank` and adds it to the Section through `targets`, in one shared transaction.
The bulk review of Questions in `question-bank` asks `interviews` which Questions have Attempts through its `QuestionAttempts` port: deleting such a Question hides it. `topicMerges` hands `interviews` over the same way as for a Topic merge.
`answer-search` (#70) reads its queue from `question-bank`, the Attempts of `interviews` and the Topic statuses of `progress`, writes Reference answers through `question-bank` and runs its agent through `agent-sessions`.
`composition-answers.ts` composes it after `interviews` and `progress`. `sources` tells the server that an Inbox processing ended through its `onRunFinished` callback, and composeFeatures hands that to `answers.inboxFinished`, which begins a waiting Answer search.
`onRunStarted` of `sources` goes to `answers.inboxStarted`: a running Answer search closes with a partial report and its agent stops, because Inbox processing goes first.
A running search whose agent has not started yet goes back to `waiting` instead, and so does a start that finds the processing running only after it stored the run.
«Наполнять в фоне» (#79) is `fillInBackground` of `app-settings`, which `answer-search` reads through its `AnswerSettings` port.
`answers.inboxFinished` starts a search of 20 Questions with it on, after a processing that `interrupted` (the server's start) did not end; `onFinished` of `interviews`, only for a finished Mock interview (a paused one the Candidate finishes counts; a pause does not), goes to `answers.interviewFinished` the same way.
A background start that does not happen goes to `onBackgroundSkipped`, which the server logs at `info`.
The Debrief in the web app reads the asked Question's Reference answer from `GET /api/targets/:id/questions` of its Topic, hidden Questions too; the Debrief API of `interviews` stays without it.
A Dispute in `interviews` puts the disputed Question on the list «Проверить опорный ответ» through its `ReferenceChecks` port, which `question-bank` supplies (#65). The Dispute and this write share one transaction: `composeSessionWork` passes `storage.transaction` to `interviews`.
`record_attempt` with the interviewer's disagreement with the reference answer does the same (#64): the Attempt and the list entry share one transaction.

### Session profiles

Each session kind has a profile (#42): the agent's role, one skill, whether shell and web are allowed, whether the Candidate answers permission requests (`askCandidate`), and the `instructions` of its MCP server.
Profiles live in `sessionProfiles` in `shared/session-kinds/profiles.ts`, beside `sessionKinds`. Write their texts in English.
`agent-runtime` builds the launch recipe from the profile; recipes never name a session kind.
`mcp-gateway` serves the profile's `instructions` at MCP `initialize`.
A session may add text to the role when it starts: `roleAddition` of `AgentSessions.start` goes after the profile's role.
The mock interview adds the Target's tone and language this way (`interviewerRole` in `interviews`).
Two texts for the agent are in Russian: `onboardingPrompt` in `target-setup/domain/brief.ts`, the first prompt of a draft Target's setup session, and `continuationPrompt` beside it, the first prompt of a setup session that continues an earlier one (#85).
It stands for the Candidate's first message, because an agent writes its first line in the prompt's language, even before it loads the skill.
The language rule itself stays in the profile's role.
The `side-thread` kind (#80) explains: skill `sensei-explain`, web on, shell off, and `askCandidate: true`, because the Side thread has a chat.
`interviews` starts it with the agent of its Mock interview and adds the Target's language (`sideThreadRole`).
Its first server prompt, `sideThreadOpened` in `handoff-brief.ts`, repeats the ban on describing plans and tools: in the live check OpenCode began that turn with an English line about loading the skill, though the role and the skill forbid it.
Its tools only read: `get_brief` of `interviews` with the Handoff brief, `get_target`, `search_questions`, `list_sources` and `get_source` of `sources` and `get_progress`.
The server builds the Handoff brief from stored data (`handoffBrief`): its `debrief`, the Grade after the latest Dispute with gaps, justification and strong answer, comes only once `asked_questions.debrief_opened` is set.
`POST /api/interviews/:id/attempts/:attemptId/debrief-opened` sets it: the browser sends it when the Candidate opens the Debrief, before it reads the Debrief; a Side thread from a Debrief sets it too.
`GET /api/interviews/:id/attempts/:attemptId` only reads the Debrief and records nothing.
A Side thread from an interviewer message (`agent-N`, the chat entry id) goes to the question that was shown when the message came.
`present_question` hides the agent's text first, then stores the number of chat entries in `asked_questions.chat_position`; the message belongs to the last question whose position is not after its index in the chat.
Questions from before this column have none and count as shown at the chat's start.
Deleting a Side thread stops its agent at once and deletes its AgentSession, the earlier sessions it continues, their journals and session directories with `AgentSessions.remove`; `asked_questions.hinted` stays.
«Продолжить» in a Side thread whose session is no longer live (`continueSideThread`, #85) starts a session with `continues` and moves `side_threads.session_id` to it; its first server prompt is `sideThreadContinues`, and `get_brief` adds `continuation.messages` from `AgentSessions.earlierMessages`.
A continuation of a Mock interview or of its Side thread picks its agent with `continuingAgent` of `interviews/application/agent-choice.ts`: the Mock interview's agent, or the Target's agent the Candidate chose; both routes answer an unavailable agent with the same 409 `agent_unavailable` of `interview-session-start.ts`.
A Side thread continued with the Target's agent leaves the Mock interview's agent as it is.
A finished Mock interview closes its Side threads whose session neither starts nor works (`closeFinishedSideThreads`): idle ones and those that a restart or a crash stopped. It sets `side_threads.closed_at` and ends the live ones; a working one goes on. Migration `0008` closes the threads that #80 already treated as closed: those of ended Mock interviews opened before their end.
`POST /api/targets/:id/archive` refuses with `session_running` only for live sessions of other kinds; it closes every Side thread of the Target (`closeTargetSideThreads`), stops the live ones with `AgentSessions.stopAll` and then archives.
A closed Side thread stays readable and refuses «Продолжить» with 409 `side_thread_closed`, also after the Target returns from the archive.

### Server messages

The server talks to the interviewer with template messages in `interviews/domain/agent-messages.ts` (#10): the start, an answer, a quiz result, «Не знаю», a Follow-up answer, five minutes left and the finish.
They go through `AgentSessions.queuePrompt`, after the agent's current turn, and stay out of the chat.
The continuation after a pause (#84), `interviewContinues`, is the first message of a new session: the agent finds where the interview stopped in the continuation summary of `get_brief`.
That session starts with `continues` of `AgentSessions.start`: its view begins with the chat of the session it continues, so the chat and chat positions span every session of the Mock interview.
A Target setup session continues the same way (#85): `prepare` of `AgentSessions.open` returns `continues` for the Target's last setup session (`AgentSessions.lastConversation`) unless the Candidate ended it, which «Завершить» records as `session_ended` with `by: "candidate"`.
A continued session gets the same launch recipe as a new one and never `session/load`: nothing of the earlier conversation goes to the agent's own storage.
The sixth message of #10, `discussedInSideThread`, tells the interviewer only that the Candidate discussed question N in a Side thread, never its content.
It is a note, not a prompt: `AgentSessions.addNote` puts it before the next prompt the agent gets, the Candidate's or the server's, so the current turn goes on.
Several Side threads on one question before that prompt give one note: `addNote` skips a note that already waits.
The journal keeps notes in `notes` of that `prompt_sent`; the chat leaves them out.

`inbox-processing` (#47) has the skill `sensei-inbox`, no shell, the web, and `askCandidate: false`: it has no chat, so the server refuses other requests itself, and the recipe allows the web without requests.
The server extracts the text of the Sources before the agent starts, so the agent needs no shell for a PDF or a page.
The server's close waits for the started processings to read their texts (`inbox.settle`), then stops the agents.
A Recheck is the same session kind in the mode `recheck`: its opening and brief differ, the server refuses `add_bank_questions` and `create_topic` in it, and `write_inbox_report` takes the list «скрыть?» as `proposals.hide`.
A run without the agent's report ends through `closeRun` in `sources/application/inbox-ending.ts`, with the partial report of `partialReport`: «Остановить разбор» (`inbox.stop`), the agent's failure (`watchAgent` follows the session as in `interviews`), an agent that stays idle for 2 minutes after its turn without the report (`watchSession` in `src/shared/agent-watch` waits with the injected `Timer` and counts the status at the start too; `watchAgent` then also ends the session), a failed start, no readable Source, and the server's start (`inbox.endInterrupted` after `sessions.endInterrupted`).
`closeRun` acts only on a run that still runs, so the agent's own report and an early end never both close it.
The run records each part the agent reads with `read_source` (`readParts`): only a Source read to its last part becomes «готов», in a partial report and in the agent's own (`settledSources`).

`answer-search` (#70) has the skill `sensei-answers`, no shell, the web, and `askCandidate: false`, as `inbox-processing`.
Its tools are `next_questions_without_answer`, `save_reference_answer` and `write_answer_report`; there is no `get_brief`: the opening names the Target, its language and the number of Questions.
The server keeps the queue (`answerQueue`) and the rule of overwriting (`overwriteRefusal`) in `answer-search/domain`; `save_reference_answer` checks both in one transaction with the write.
It takes only a visible Question that `next_questions_without_answer` gave this run (`handedIds`), so a run never writes more answers than the Candidate chose.
`next_questions_without_answer` reads and records `handedIds` in one transaction, so parallel calls get different Questions; it skips a Question hidden since the start and never records it.
A run that starts while the Target's Inbox processing runs is `waiting`; it takes its queue and starts its agent when that processing ends.
It ends without the agent's report through `closeRun` in `answer-search/application/answer-ending.ts`, as an Inbox processing does, and `answers.endInterrupted` runs before `inbox.endInterrupted` at the server's start, so a closed Inbox processing begins no waiting run of the last start.
The report reads the usage from the session's journal when it is shown (`AgentSessions.usage`): an agent may send its `usage_update` after its last tool call.
ACP defines `used` as the tokens in the context, `size` as the context window and `cost` as the session's cumulative cost, so the report shows «Токенов в контексте агента: N из SIZE» and the cost, never a total spend.

A slice adds a session kind like this:

1. Add the kind to `sessionKinds` in `shared/session-kinds/kinds.ts`.
2. Add its profile to `sessionProfiles` and its tool set to `sessionTools` in `composition.ts`; both fail to compile until they have the entry.
3. Add its skill as `skills/<name>/SKILL.md` in English, with `name` equal to the directory and a `description`. Name the skill in the profile.
4. Leave the recipes in `agent-runtime/domain/*-recipe.ts` unchanged; they translate any profile.

At each start the runtime reads the skill from `skills/`, or from its copy in the built app, and the recipe copies it into the data directory, so the next session gets the skill as it is now:

| Agent | Role | Skill | Shell and web off |
| --- | --- | --- | --- |
| Claude Code | ACP `systemPrompt`, `append` | local plugin `interview-sensei` in `agents/claude/skills/<skill>`; `skills` lists only `interview-sensei:<skill>` | `disallowedTools`: `Bash`; `WebFetch`, `WebSearch` |
| Codex | ACP `systemPrompt`, `append`, with the note that `apply_patch` asks the Candidate | `.agents/skills` of the ACP `additionalDirectories` entry `agents/codex/skills/<skill>`; with shell off, its `SKILL.md` also in the `systemPrompt` | `CODEX_CONFIG`: `features.shell_tool = false`; `web_search = "disabled"` |
| OpenCode 1.x | `prompt` of its own primary agent `interview-sensei` in `agent`, selected as the session's mode | `skills.paths` with `agents/opencode/skills/<skill>`; `OPENCODE_DISABLE_EXTERNAL_SKILLS` | that agent's `permission`: `bash`; `webfetch`, `websearch` = `deny` |
| OpenCode 2.x | `system` of the same agent in `agents`, also `default_agent`, selected as the session's mode | `skills` with the same path; `policies`: `skill.use` only for `<skill>`; `OPENCODE_DISABLE_EXTERNAL_SKILLS` as a backup | that agent's `permissions`: `shell`; `webfetch`, `websearch` = `deny` |
| fake | ACP `systemPrompt`, `append` | as Codex, in `agents/fake/skills/<skill>` | `_meta.fakeAgent.disallowedTools` |

A profile with the web and `askCandidate: false` lets the agent use the web without permission requests, since nobody answers them (`webWithoutAsking` in `recipe.ts`).
Claude Code gets `WebFetch` and `WebSearch` in `allowedTools`; the OpenCode agent gets `webfetch` and `websearch` = `allow`.
Codex asks no permission for its web search.

Codex 0.165 reads a skill file only through shell, so a profile without shell gets the skill's `SKILL.md` in the role.
Its read-only sandbox makes the model refuse writes, though `apply_patch` asks the Candidate first; the role tells it so.
Its `config.toml` sets `features.apps` and `features.plugins` to `false`: the Candidate's ChatGPT apps and plugins bring their own tools and skills.
The OpenCode recipe writes the config keys of the installed version.
`inspectAgentHost` runs only `opencode --version`: 1.x prints `1.18.30`, 2.x prints `opencode v2.2.6`.
After 5 seconds on the injected `Timer` it kills the process with SIGKILL and stops reading, so the version is unknown.
`opencodeConfigSchema` picks 2.x for a major version of 2 or more, and 1.x for any other answer or none: 2.x still reads the 1.x keys, but older 1.x releases do not read the 2.x keys.
2.2.6 reads `~/.agents/skills` despite `OPENCODE_DISABLE_EXTERNAL_SKILLS`, so its `policies` deny every skill except the profile's.
The launcher sets the mode with `session/set_mode` when `session/new` lists it in `modes`.
Otherwise it sets the config option of category `mode`: OpenCode 1.17 and later offer their agents only there.
An agent without the ACP capability for the recipe's `systemPrompt` or `additionalDirectories` does not start, and neither does one that does not offer the recipe's mode either way.
A profile that allows shell or web gets no ban for it. The permission modes stay as [storage](#storage) and #17 set them.

### Text of Sources

The `sources` slice reads the text of a Source itself (#63) and cuts it into numbered parts of at most 8000 characters at paragraph borders (`textParts`); `read_source` gives one part.
The parts lie in `targets/<Target id>/texts/<Source id>/0001.txt` and onward, beside the Sources' files, so deleting the Target removes them.
`textFormat` picks the reader by the file's extension; a link is a web page.

| Format | Reader |
| --- | --- |
| PDF | `unpdf` 1.x, which bundles pdf.js; 2.x needs Node 24, and the package runs on Node 22.15 |
| DOCX | `word/document.xml` from the archive by `fflate`, its paragraphs by `documentXmlText` |
| TXT, MD | the file as UTF-8 |
| SRT, VTT | `subtitleText`: the spoken lines without numbers, times, tags and repeats |
| HTML file, link | the page's article by `@mozilla/readability` on `linkedom`, then `htmlText`; a link's PDF or plain text by its content type |

A page waits at most 30 seconds on the injected `Timer` and may hold at most 20 MB.
linkedom and Readability type their DOM with TypeScript's DOM library, which server code does not load.
So only `sources/infrastructure/page-text.ts` touches their DOM, under a file-level disable of the unsafe-value rules with that reason.
A Source the server cannot read gets the Source status «ошибка» with the reason in Russian.
A link to a web page is the exception: it stays «разбирается» without parts, and the Inbox processing agent opens it on the web.

### Local requests

The server listens only on `127.0.0.1` (the default), `::1` or `localhost` (#23).
For any other `SERVER_HOST`, `0.0.0.0` and `::` included, `run-server.ts` exits with code 1 before it opens the data directory.
`acceptLocalRequestsOnly` in `apps/server/src/local-requests.ts` answers 403 to a request from another site.
Every request needs a loopback `Host` with the server's port, so DNS rebinding fails.
Requests other than GET and HEAD, WebSocket upgrades and requests with an `Origin` need the server's own loopback origin.
Only `pnpm dev` adds the Vite dev server's origin, through `allowedOrigins` in `main.ts`; the Vite proxy sets the server's `Host`.
The MCP addresses skip this check and keep the MCP SDK's own `Host` and `Origin` checks.
`server.ts` builds the `exemptRoutes` list of these skipped routes; no other file adds to it.
Adding an exemption needs the owner's review.

### MCP tools

`mcp-gateway` gives each AgentSession its own MCP address, `/mcp/<secret token>`, with the tool set of its session kind.
The address is `http://127.0.0.1:<server port>` when the server listens on IPv4, as on `127.0.0.1` or `localhost`.
On `::1` alone it is `http://[::1]:<server port>`: the agent runs on this machine.
It names the session's MCP server `interview-sensei-<random hex>`, so a server named `interview-sensei` in the Candidate's agent config is never taken for ours.
A tool lives in the `application/` of the slice that owns its data: define it there with `sessionTool` from `src/shared/mcp` and export it from the slice's `index.ts`.
Content that differs by session kind lives in that slice's `domain/`.
`get_brief` is the template: the tool is in `mcp-gateway/application/get-brief.ts`, and the brief of each kind is in `briefFor` in `mcp-gateway/domain/brief.ts`.
A kind whose brief needs a slice's data gets its own `get_brief` from that slice instead: `target-setup` builds the brief of the Target setup from the Target, and `interviews` gives the one of `mock-interview`.
A tool refuses a call by throwing an `Error` whose English message names the rule, such as «The last question already has its Attempt»; the agent gets it as the tool's error.
`sessionTools` in `apps/server/src/composition.ts` lists the tools of each session kind; add the new tool there.
A tool acts only on the session it receives. Write its name in snake_case and its description in English.
API tests call a tool as the agent does: the fake agent's prompt `/tool <name> <json>` calls it on the session's MCP address with these arguments ([testing](docs/agents/testing.md#test-levels)).

The server allows calls of our MCP tools without asking the Candidate; `automaticAnswer` in `agent-runtime/domain/permissions.ts` decides.
It reads only the structural marker that the agent's adapter sets, never `title` or other text.
It allows a request in two cases, and only with that session's MCP server name:

- The request carries our marker, and the `tool_call` the agent announced with the same `toolCallId` carries no other marker.
- The request carries no marker, the announced `tool_call` carries ours, and the request gives no other `kind`.

Then the server picks `allow_once`; without that option, and for an agent kind it does not know, the Candidate decides.
The Candidate decides only when the profile's `askCandidate` is true, as in `service-chat`.
Otherwise the server refuses the request itself with `reject_once`, or `cancelled` without that option; `refusal` in `permissions.ts` picks it.
The `mock-interview` chat shows no requests, so a request there would stop the turn for good (#41).
The runtime keeps announced tool calls only until they complete or fail, or the turn ends.
Each agent's marker lives in `mcpServerReaders`:

- Claude Code: the request's `_meta.claudeCode.mcpServer` with `source: "dynamic"` and our `name`. This shape comes only from the console of one live run; the live check must capture the real payloads.
- Codex: the announced `tool_call` with `_meta.is_mcp_tool_call: true` and our `rawInput.server`; the request repeats its `toolCallId` and `kind`.
- OpenCode: no marker. It asks permission only for the tools its config sets to `ask`, and every such request goes to the Candidate.

A new agent or adapter version needs its marker there and unit tests in `agent-runtime/permissions.test.ts`.
Other workspaces reach core only through the subpaths in `packages/core/package.json` `exports`.

### Storage

Only the server opens the data directory (ADR-0002); `packages/core/src/shared/storage` holds the lock, PGlite, migrations and dumps.
The application writes only inside the data directory.
It never writes into the Candidate's agent directories, such as `~/.claude`, `~/.codex` or `~/.config/opencode`: it only checks the login there and links to `auth.json`.
Claude Code is the exception, approved by the owner in #24.
It keeps the Candidate's config directory, `CLAUDE_CONFIG_DIR` or `~/.claude`, because it ties the Keychain login to it.
So Claude Code writes its own state there; the recipe isolates it with `settingSources: []` and `persistSession: false`.
It reads one thing more there: the OpenCode recipe takes the Candidate's model from the global OpenCode config.
It takes `model`, as `provider/model` or as the 2.x reference `{ providerID, model, variant }`, and `small_model`.
It takes their provider entries from both `provider` (1.x) and `providers` (2.x).
The recipe passes these keys as they are; OpenCode 2.x migrates the 1.x ones itself.
The 2.x small model in `agents.title.model` stays out with the rest of `agents`.
`opencodeModelSettings` in `agent-runtime/domain/opencode-settings.ts` picks them; other keys, such as `mcp`, `permission`, `agents` or `instructions`, never reach the agent.
The server never logs or journals that config.
The model comes from `config.json`, `opencode.json` and `opencode.jsonc` in `$XDG_CONFIG_HOME/opencode` or `~/.config/opencode`.
The recipe passes the copied provider entries in `OPENCODE_CONFIG_CONTENT`, which has no file location.
So a relative `{file:...}` in such an entry may not resolve; `~/` and absolute paths do.
The recipe drops `OPENCODE_CONFIG`, so it ignores a model that the Candidate chose only in that file.
OpenCode 2.x keeps provider keys in the `credential` table of its `opencode.db` and ignores `auth.json` in a new database.
So the server also reads that table, in `$XDG_DATA_HOME/opencode` or `~/.local/share/opencode`, or the file that `OPENCODE_DB` names there.
It reads the table only at the start of an OpenCode 2.x session, never to list the agents.
It opens the database `immutable` and read-only, so it creates no `-shm` or `-wal` file; a key still in OpenCode's write-ahead log appears after a checkpoint.
`opencodeKeys` takes the key of the credential OpenCode would use, only for the providers of the Candidate's `model` and `small_model`.
Without either, every provider gets its key, because OpenCode may then pick any of them.
An OAuth credential gives no key, because a copied refresh token could rotate.
An unreadable database gives no keys and a warning in the server log with its path and SQLite's reason, never its content.
OpenCode 2.2.6 does rotate an OAuth refresh token: each refresh stores the provider's new refresh token (#69).
So a subscription login needs the application's own login, which the owner chose in #69: `interview-sensei login opencode`.
It runs `opencode auth login --standalone` in the recipe's OpenCode homes in the data directory; `opencodeLoginCommand` builds it.
`--standalone` keeps the login off the Candidate's background OpenCode service, which would write the Candidate's database.
OpenCode keeps the login in its database there, and every session shares that database and refreshes the login itself.
Sessions refresh it one at a time: OpenCode locks the refresh in `$XDG_STATE_HOME/opencode/locks`, which they share too.
2.x gets its own data home, `agents/opencode/data-2`, without the link to `auth.json`; 1.x keeps `data` and the link.
Otherwise 2.x, migrating a database that 1.x left in `data`, would import the Candidate's `auth.json`, refresh token and all.
A 2.x database that earlier sessions left in `data` stays as it is, which the owner chose in #69: no session refreshes a token in it any more.
The command refuses OpenCode 1.x: 1.x would write the login through the link to the Candidate's `auth.json`.
At the start of a 2.x session the server also reads the credentials of that database, in the same way.
`opencodeLoginsToRepeat` names the session's providers with a subscription login of the Candidate and no login of the application; the runtime warns of each in the server log.
The README and the OpenCode note of «Проверка агента» give the command.
The 2.x recipe passes each key in its own variable `INTERVIEW_SENSEI_OPENCODE_KEY_<n>` and names it in `env` of the provider's `providers` entry; the config text holds no key.
The agent gets the Candidate's env without `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_DB`, `CODEX_HOME` and `INTERVIEW_SENSEI_*`; the recipe's variables go over it.
`agentEnvironment` in `launch-recipe.ts` filters it. `CLAUDE_CONFIG_DIR` passes unchanged.
API keys stay: the Candidate chose them. With `ANTHROPIC_API_KEY` set, Claude Code bills the API instead of the subscription.
Launch recipes in `agent-runtime/domain/*-recipe.ts` put every directory, file and link into the data directory; their unit tests check it.
`prepareRecipe` refuses a recipe path outside the data directory or through a link inside it.
It removes files and directories only inside the recipe's `syncedDirectories`, the skill copy, so the copy equals its source.
A slice that stores data owns a Postgres schema named after it, with its Drizzle tables and drizzle-kit migrations in `infrastructure/`.
The slice keeps its tables in `infrastructure/schema.ts` and its drizzle-kit config in `infrastructure/drizzle.config.ts`, with the output in `infrastructure/migrations/`.
Generate migrations with `db:generate`; never write or edit them by hand, except the SQL body of a data migration below. Prettier ignores them.
A data migration is a custom drizzle-kit migration of one slice: `pnpm --filter @interview-sensei/core exec drizzle-kit generate --config src/features/<slice>/infrastructure/drizzle.config.ts --custom --name <name>` writes an empty SQL file with its journal entry and snapshot, and only that file's SQL body is written by hand, on the slice's own schema, such as `interviews` 0008 (`db:generate --custom` would add an empty one to every slice).
Prettier reads `.prettierignore` only from its working directory, so run it from the root (`pnpm format`) or from `packages/core`, which has its own copy; never from another directory.
`db:generate` turns the first `CREATE SCHEMA` into `CREATE SCHEMA IF NOT EXISTS`, because the migrator first creates the schema for the history table.
`schema.ts` exports its `pgSchema`: drizzle-kit reads only exported objects and would otherwise drop the schema.
The slice exports its `SliceMigrations` from `index.ts`, and `sliceMigrations` in `apps/server/src/composition.ts` lists it.
A slice queries only its own schema.

A change that spans slices writes in one shared transaction, such as applying a draft of changes (#48).
`Storage.transaction` in `shared/storage` opens it; `composeFeatures` passes it to the slice that runs the change, `target-setup` for the draft.
That slice reaches the other slices only through its domain ports, as [references between slices](#references-between-slices) say; slices still never import each other.
A write port takes the open transaction as its last parameter, and so does each read the change makes.
The domain port declares it as a type parameter `Transaction`, so `domain/` stays free of storage code; `application/` and `infrastructure/` use `Transaction` from `shared/storage`.
The repository runs its queries on `executorOf(database, transaction)`: on the transaction when it gets one, on the database otherwise.
Inside the transaction every query of the change uses it, reads included: PGlite runs one transaction at a time, so a query on the database would wait for the transaction and never finish.
Any rejection rolls back the writes of every slice; `shared-transaction.int.test.ts` in `apps/server` checks it.

Deleting a Target for good erases its data in every slice in one such transaction (#51).
Each slice that keeps data of a Target gives its service `eraseTarget(targetId, transaction)`.
`targetData` in `composeFeatures` lists these slices; a new slice with Target data joins the list.
`deleteTarget` in `apps/server/src/target-deletion.ts` runs the erasure; files are not in the transaction.
So a slice with files of a Target also gives `eraseTargetFiles(targetId)`, which runs after the commit, as `sources` does.
The agents of the Target's live sessions stop before the transaction: their journal writes would wait for it.
`target-deletion.int.test.ts` counts the rows with the Target's `target_id` in every schema, so a new slice is checked too.

### Canvas zones

The web app opens on the canvas of one Target, `pages/target`, built on React Flow (`@xyflow/react`).
`Canvas` in `shared/ui/canvas` is the frame: it places zones from left to right, moves and scales the view.
A zone is one React Flow node that groups its widgets; the widgets are plain React inside it, stacked from top to bottom.
React Flow turns pointer events off in a node that is neither selectable nor draggable, so `Canvas` gives each zone node `pointerEvents: "all"`; its widgets take clicks without their own `pointer-events`.
`targetZones` in `pages/target/ui/target-page.tsx` lists the zones «Цель» and «Сессии» and the content of each.
A slice adds content to a zone like this:

1. Write its widget in `widgets/<name>/` and export it from the slice's `index.ts`. A widget that only `pages/target` uses stays in `pages/target/ui`, as `TargetCard`, the plan, the setup chat and `ui/mock-interview/` do: Steiger's `fsd/insignificant-slice` refuses a widget slice with one user.
2. Add the widget to the zone's `content` in `targetZones`.

The slice leaves `Canvas` and the top bar (`widgets/top-bar`) unchanged.
React Flow also turns text selection off in its nodes; text the Candidate selects, such as a fragment for a Side thread inside `data-discuss-scope`, sets `user-select: text`.
The owner approved one exception in #45: the top bar gets «Новая цель» and «Настройки».
Spec #45 also puts «Меню цели» there, with «В архив», and the item «Архив» in the Target switcher.
Issue #71 adds `overhang` to a zone: the canvas pixels a widget takes to the right of the zone's width, such as the open setup chat.
`Canvas` moves the next zones right by as much, so the widget covers none of them.
A new zone is a new entry in `targetZones` and needs the owner's decision.
An input or a scrolled list inside a widget gets the React Flow classes `nodrag`, `nopan` and `nowheel` where the canvas must not take its pointer or wheel.

Styles follow the «чистый» style of the UI prototype (#3), light theme, large for a 2K monitor.
Colors, fonts, font sizes and radii come only from the CSS variables in `apps/web/src/app/styles/tokens.css`, so a dark theme only redefines them.
Spacing uses the `--space-*` variables where a step fits.
User-facing text is in Russian.

### Mechanical rules

`pnpm check` enforces these rules and options. Change a rule only with the owner's agreement.

| Rule                                        | Tool               | Purpose                                                                  |
| ------------------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| `domain-is-pure`                            | dependency-cruiser | Domain imports only its own feature's domain: no infrastructure, frameworks, Node built-ins. |
| `application-does-not-use-infrastructure`   | dependency-cruiser | Application depends on ports, not on their implementations.             |
| `features-are-independent`                  | dependency-cruiser | Core slices do not import each other, so parallel slices do not conflict. |
| `shared-is-technical`                       | dependency-cruiser | `src/shared/` does not depend on feature slices.                        |
| `no-circular`                               | dependency-cruiser | No import cycles, type-only imports included. In web and e2e, oxlint `import/no-cycle` reports value-import cycles. |
| `server-uses-core-exports`                  | dependency-cruiser | The server imports core by package subpath, never by a path into `packages/core/src`. |
| `server-composes-features-in-one-module`    | dependency-cruiser | Only `apps/server/src/composition.ts` and its parts `composition-<part>.ts` import core features; other server files take services from it. |
| `not-to-unresolvable`                       | dependency-cruiser | Every import resolves, including core subpath exports.                  |
| `tsPreCompilationDeps` (option)             | dependency-cruiser | An option, not a rule: the rules above count type-only imports as dependencies. |
| `interview-sensei/require-disable-reason`   | oxlint             | Every disable directive gives a reason after `--`.                      |
| `interview-sensei/no-current-time`          | oxlint             | No `Date.now()` or argument-less `new Date()`; use the injected `Clock`. |
| `interview-sensei/no-playwright-test-modifiers` | oxlint         | No `test.only`, `test.skip` or `test.fixme` in Playwright tests.        |
| `fsd/*` recommended                         | Steiger            | Feature-Sliced Design layers, slices, segments and public APIs in web.  |
| strict `tsconfig`                           | oxlint type check  | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and others. |
| unused files, exports, dependencies         | knip               | No dead code or unused packages.                                        |

The clock lives in `packages/core/src/shared/time`; only `system-clock.ts` reads the real time.
Node runs server sources directly by type stripping: use only erasable syntax and `.ts` import extensions.
So the server in the repository has no build step. `pnpm build` builds the web app into `apps/web/dist/web` and copies `skills/` to `apps/web/dist/skills`.
The `interview-sensei` command serves the first and gives the agents the second.
Then `pnpm build` compiles the server and core into the npm package in `apps/server/dist/package`, keeping the repository layout.
A file that the code reads beside itself, as the migrations, needs the same place in the package; `apps/server/scripts/build-package.ts` copies it.
Dependency versions are exact. `pnpm-workspace.yaml` holds the supply-chain settings: release age, trust policy and allowed install scripts.
Add a trust exclusion or install script only with a comment that gives the reason.

### Reviewer checks

Check that a new rule exception names its reason and the narrowest files it covers.
Check that tests follow [testing](docs/agents/testing.md): behavior at the public boundary, names after behavior.
Check that user-facing text in the web app is in Russian.
Check that repeated work takes the injected `Timer` from `packages/core/src/shared/time`; only `system-timer.ts` starts real timers.

## Contextual checks

For agent instructions, apply `.agents/skills/writing-for-agents/SKILL.md` and its skill-mechanics reference where relevant.
Check that conditional pointers reach their material before an action needs it.
Keep the authority for each process rule in one place.

For human documentation, check that the Russian text states decisions, evidence and required actions clearly.

For borrowed material, inspect provenance, retained notices and documented adaptations.
A changed source pin must describe the files actually updated.

A static check or successful skill invocation does not prove process effectiveness.

## Findings and maintenance

Cite the source rule, location, triggering condition and consequence.
Distinguish defects from optional suggestions.
Use observed missed defects or recurring friction to propose contextual rules.
State when a new rule applies, what to inspect, why it matters and its source.
Confirm new policy with the owner.
Mechanically checkable requirements belong in the existing checker rather than duplicated reviewer work.
