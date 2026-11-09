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

### Session profiles

Each session kind has a profile (#42): the agent's role, one skill, whether shell and web are allowed, whether the Candidate answers permission requests (`askCandidate`), and the `instructions` of its MCP server.
Profiles live in `sessionProfiles` in `shared/session-kinds/profiles.ts`, beside `sessionKinds`. Write their texts in English.
`agent-runtime` builds the launch recipe from the profile; recipes never name a session kind.
`mcp-gateway` serves the profile's `instructions` at MCP `initialize`.
A session may add text to the role when it starts: `roleAddition` of `AgentSessions.start` goes after the profile's role.
The mock interview adds the Target's tone and language this way (`interviewerRole` in `interviews`).

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
The 2.x recipe passes each key in its own variable `INTERVIEW_SENSEI_OPENCODE_KEY_<n>` and names it in `env` of the provider's `providers` entry; the config text holds no key.
The agent gets the Candidate's env without `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, `OPENCODE_DB`, `CODEX_HOME` and `INTERVIEW_SENSEI_*`; the recipe's variables go over it.
`agentEnvironment` in `launch-recipe.ts` filters it. `CLAUDE_CONFIG_DIR` passes unchanged.
API keys stay: the Candidate chose them. With `ANTHROPIC_API_KEY` set, Claude Code bills the API instead of the subscription.
Launch recipes in `agent-runtime/domain/*-recipe.ts` put every directory, file and link into the data directory; their unit tests check it.
`prepareRecipe` refuses a recipe path outside the data directory or through a link inside it.
It removes files and directories only inside the recipe's `syncedDirectories`, the skill copy, so the copy equals its source.
A slice that stores data owns a Postgres schema named after it, with its Drizzle tables and drizzle-kit migrations in `infrastructure/`.
The slice keeps its tables in `infrastructure/schema.ts` and its drizzle-kit config in `infrastructure/drizzle.config.ts`, with the output in `infrastructure/migrations/`.
Generate migrations with `db:generate`; never write or edit them by hand. Prettier ignores them.
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
The zone node takes pointer events, so its buttons work although the node is neither selectable nor draggable.
`targetZones` in `pages/target/ui/target-page.tsx` lists the zones «Цель» and «Сессии» and the content of each.
A slice adds content to a zone like this:

1. Write its widget in `widgets/<name>/` and export it from the slice's `index.ts`. A widget that only `pages/target` uses stays in `pages/target/ui`, as `TargetCard`, the plan and the setup chat do: Steiger's `insignificant-slice` refuses a slice with one user.
2. Add the widget to the zone's `content` in `targetZones`.

The slice leaves `Canvas` and the top bar (`widgets/top-bar`) unchanged.
The owner approved one exception in #45: the top bar gets «Новая цель» and «Настройки».
Spec #45 also puts «Меню цели» there, with «В архив», and the item «Архив» in the Target switcher.
Zone content that only `pages/target` uses stays in that page's `ui/`, such as `ui/mock-interview/`: Steiger's `fsd/insignificant-slice` rejects a widget slice with one reference.
React Flow turns pointer events off in the zone nodes, so the root of a zone's interactive content sets `pointer-events: auto`.
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
