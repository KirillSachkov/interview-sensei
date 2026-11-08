# Review standards

This document guides the Standards reviewer for this repository.
Root `AGENTS.md` owns authority and scope.

## Application code

The stack is TypeScript on Node 24 in a pnpm workspace; NestJS is not used.

| Workspace       | Role                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `apps/server`   | Fastify server: composes core features, serves HTTP under `/api`.             |
| `apps/web`      | React, Vite, TanStack Router and Query, Feature-Sliced Design.                |
| `packages/core` | Feature slices in `src/features/<feature>/` and technical code in `src/shared/`. |
| `e2e`           | Playwright tests against the running server and web app.                      |
| `skills/`       | Skills the application gives the Candidate's agent; not a workspace.          |

Shared settings live in `config/`: TypeScript, oxlint with the project plugin, and the dependency-cruiser base.

### Core feature slices

A feature slice has the layers `domain/`, `application/` and `infrastructure/`; create a layer when it gets code.
`domain/` is plain TypeScript and imports only the `domain/` of its own feature.
`application/` uses domain ports and receives infrastructure as parameters.
Technical ports such as `Clock` live in `src/shared/`; application code may use them too.
Slices never import each other. `src/shared/` is technical and never imports slices.
Other workspaces reach core only through the subpaths in `packages/core/package.json` `exports`.

### Storage

Only the server opens the data directory (ADR-0002); `packages/core/src/shared/storage` holds the lock, PGlite, migrations and dumps.
The application writes only inside the data directory.
A slice that stores data owns a Postgres schema named after it, with its Drizzle tables and drizzle-kit migrations in `infrastructure/`.
Its first migration starts with `CREATE SCHEMA IF NOT EXISTS`, because the migrator first creates the schema for the history table.
The slice exports its `SliceMigrations` from `index.ts`, and `sliceMigrations` in `apps/server/src/server.ts` lists it.
A slice queries only its own schema.

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
| `not-to-unresolvable`                       | dependency-cruiser | Every import resolves, including core subpath exports.                  |
| `tsPreCompilationDeps` (option)             | dependency-cruiser | An option, not a rule: the rules above count type-only imports as dependencies. |
| `interview-sensei/require-disable-reason`   | oxlint             | Every disable directive gives a reason after `--`.                      |
| `interview-sensei/no-current-time`          | oxlint             | No `Date.now()` or argument-less `new Date()`; use the injected `Clock`. |
| `interview-sensei/no-playwright-test-modifiers` | oxlint         | No `test.only`, `test.skip` or `test.fixme` in Playwright tests.        |
| `fsd/*` recommended                         | Steiger            | Feature-Sliced Design layers, slices, segments and public APIs in web.  |
| strict `tsconfig`                           | oxlint type check  | `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and others. |
| unused files, exports, dependencies         | knip               | No dead code or unused packages.                                        |

The clock lives in `packages/core/src/shared/time`; only `system-clock.ts` reads the real time.
Repeated work takes the `Timer` from the same module; only `system-timer.ts` starts real timers.
Node runs server sources directly by type stripping: use only erasable syntax and `.ts` import extensions.
Dependency versions are exact. `pnpm-workspace.yaml` holds the supply-chain settings: release age, trust policy and allowed install scripts.
Add a trust exclusion or install script only with a comment that gives the reason.

### Reviewer checks

Check that a new rule exception names its reason and the narrowest files it covers.
Check that tests follow [testing](docs/agents/testing.md): behavior at the public boundary, names after behavior.
Check that user-facing text in the web app is in Russian.

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
