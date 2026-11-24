# Testing strategy

The seams this project agreed to test at. `tdd` treats them as pre-agreed. A kind of change
missing from the table is a question for the owner; add the answer as a new row.

| Kind of change | Where it is checked | Kind of test | Not tested |
| --- | --- | --- | --- |
| A rule of the product: goals, scenarios, attempts, readiness | the module's public operation | Vitest domain test | the module's internal functions |
| An HTTP route or its contract | the real Fastify route, with the Zod schemas from `packages/contracts` | Vitest through the API: JSON, cookies, another workspace's ID, a disallowed origin | Fastify internals |
| Storage, a migration, a transaction | a real PostgreSQL started by Testcontainers | Vitest integration: a clean database migrates, a rerun keeps data, a failed second write rolls back | a mocked database |
| The queue and recovery after a break | the service's public operations with a controlled model | Vitest integration: break at a set point, restart the handler, compare the visible status, the published scenario and the number of paid calls | the queue library |
| A path the candidate walks in the browser | the running application | Playwright end to end, including a restart of the API on the same database | visual styling |
| Module boundaries, types, code rules | `pnpm check` | static rules, with one passing example and one expected diagnostic per rule | — |
| The meaning of a model's replies and the fit of its sources | a live run through AITUNNEL, started on purpose | recorded run, judged by the owner or a subject specialist | never part of `pnpm check` |
| Documentation and agent instructions | `git diff --check`, and the Standards review for English and Russian parity | structural check and review | wording |

Data and services tests may use: synthetic data only; a real PostgreSQL in a container; a controlled model with set answers. The AITUNNEL secret is used only in live runs the owner starts.

`pnpm check` runs every required check locally and in GitHub Actions. Run it alongside `git diff --check`.
