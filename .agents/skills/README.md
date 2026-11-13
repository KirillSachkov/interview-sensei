# Skills: runtime and provenance

## Agent Kit selection

The current managed subset, immutable source and update procedure are in [AGENT-KIT.md](AGENT-KIT.md). The manifest owns only those selected folders. The predecessor receipts and local adaptation notes below remain provenance for the other folders; an older whole-set sync recipe does not apply to the managed subset.


The predecessor installation contained 27 editable skill copies derived from
[Matt Pocock’s snapshot](https://github.com/mattpocock/skills/tree/a496f5513d4a4cf889bc48e189e579f4b0bdf6aa),
commit `a496f5513d4a4cf889bc48e189e579f4b0bdf6aa`, and the locally authored `ship` skill.
They arrived through [ai-first-platform](https://github.com/KirillSachkov/ai-first-platform/commit/53c0b946506b41839e255806144c3289680061c8).
These are adapted copies, not a claim of byte identity with upstream.

## Runtime

Skills live in `.agents/skills`; `.claude/skills` points here.
Clients read root `AGENTS.md` natively; the repository has no `CLAUDE.md`.
Use the client’s native skill mechanism where available.
When it is unavailable, read the named SKILL.md and its references, then follow the explicit assignment.
This fallback does not allow an agent to select user-only entrypoints itself.
Native metadata preserves the same invocation choice; reading files does not prove client discovery.
If independent subagents are unavailable, report independent review as unavailable rather than substituting self-review.

## Package skills

Package skills come from npm dependencies, not from this repository.
`pnpm install` links them here as `pnpm-<package>-<skill>` symlinks into `node_modules`.
pnpm links a package's skills only after approval in `permissions` of `pnpm-workspace.yaml`.
The `skills.dirs` setting there limits the links to this directory.
Git ignores the links and the `.gitignore` that pnpm writes here.
The lockfile pins their content, so they have no row in the identity table and no native metadata.
`scripts/check.py` accepts a link only if its name starts with `pnpm-` and it resolves inside the repository `node_modules`.
Any other link here fails the check.
For each accepted link, the check requires a `SKILL.md` with a name and a description.

| Package | Link folder | Frontmatter name |
| --- | --- | --- |
| `@tanstack/react-router` | `pnpm-@tanstack+react-router-react-router` | `react-router` |
| `@tanstack/router-core` | `pnpm-@tanstack+router-core-router-core` | `router-core` |
| `@tanstack/router-plugin` | `pnpm-@tanstack+router-plugin-router-plugin` | `router-plugin` |

Limits:

- pnpm links only `skills/<name>/SKILL.md`. The nested skills `compositions/router-query` and `lifecycle/migrate-from-react-router` of `@tanstack/react-router` are not linked.
- pnpm links skills only of direct dependencies. `apps/web` lists `@tanstack/router-core` for this reason: `react-router` declares `requires: router-core`.
  Its version must match the one `@tanstack/react-router` depends on; bump both together.
- Discovery of these links by Claude Code and Codex is not verified.
- A lockfile bump changes the skill text. No hash pins it.

Adding a package's skills needs the owner's decision. Then run `pnpm approve <package>`.

## Local adaptations

- Domain consumers and setup use `DOMAIN.md` and `DOMAIN-MAP.md` consistently.
- Project pointers preserve explicit starts, worktree ownership, human decisions, committed review and verified delivery.
- `implement` owns small-task corrections; `implement-spec` uses one fresh correction implementer for the full-diff review and one for each ticket review.
- `implement-spec` adds a project line for review after each ticket when the spec chooses it (#29).
- `code-review` reports two independent axes and checks corrections without discarding prior full coverage.
- `pr` uses the selected human language, conditional presentation guidance and visible human actions.
- `pr` adds project lines for the five required report parts and the report format; its upstream lines stay.
- `pr` shapes its template to the report format: owner action first, short evidence and decisions with alternatives (#31).
- `ship` delivers through existing project testing/tracker contracts; it does not deploy or approve merge.
- Setup selects English or Russian human language and preserves existing settings and equivalent pointers.
- Explanations and architecture reports follow that language. Tracker authorship precedes localized triage disclosures.
- `to-spec` keeps every upstream line; project rules sit in separate added lines.
- `ask-matt`, `to-spec` and `to-tickets` read project policy without redefining it; diagnosis follows the same authority.
- Instruction ownership (#3): delivery criteria stay in the project guide and actions in `ship`. This change removes no upstream Matt text.
- `to-spec` calls the spec a snapshot of the decision, not a description of current behavior.

## Notices and updates

Retain [Matt’s MIT notice](LICENSE.mattpocock), [HumanLayer’s MIT notice](LICENSE.humanlayer) and [PR credits](pr/CREDITS.md).
See [upstream maintenance](../../docs/upstream.ru.md) for selective three-way updates.
Current source exception: the 24 managed folders listed in AGENT-KIT.md use Agent Kit at the recorded manifest revision.
The four retained project variants keep their predecessor source and adaptation notes. `ship` originated locally and is now in the selected shared source line.
Local adaptations do not imply a newer upstream source revision.
Record per-skill source exceptions here before changing the default source snapshot after a partial update.

## Content identity

SHA-256 per directory: sorted relative file paths encoded as UTF-8, NUL, file bytes, NUL.
Concatenate each entry and hash the result. Includes references and native metadata.
Hashes establish identity, not correctness or behavior.

| Skill | SHA-256 |
| --- | --- |
| `ask-matt` | `68e78cf855fe70134e993ad8c6329e2048176da5669892715ae008bb1766062a` |
| `code-review` | `4c5be2d96236c5ee896328766b4fb45916146159ad27a3017627569289272640` |
| `codebase-design` | `47db031f17e8c466c2702611aae22a9c23dae978e62426c9c4f6e5ff0ffeaa54` |
| `diagnosing-bugs` | `9a7f427a79d4f39c6b4b329bf0573084a896d98bcbc935776f011f9efb1317bd` |
| `domain-modeling` | `9b0447b29704143616c0781fef03690073e22c3cd3e4068efa3e80b73d00593c` |
| `grill-me` | `aeb36f404e7c20d5999ac7bf3f4f9f1630ec1bd506f9e2f1ec560471a9790993` |
| `grill-with-docs` | `f130a89ef0647e174b30ab2adf3428e3a47c553c4af8e4e24381858110f413ff` |
| `grilling` | `b4d5e522b6280470e5174f377478a5a3233e7f5c8ae48e6426218ef9b1c70967` |
| `handoff` | `83e27e593f40a6625563d1743f2680448de02f9461a1623529ba142be450f169` |
| `implement` | `0e97728cc7fe246bddd15534fd5c405ec67b15ff6d50dd2fb9f2d03f0bee3fc0` |
| `implement-spec` | `237295dc854d24a4047f1087d795a2fa0685d7f9f0b869186f142957dd60b14c` |
| `improve-codebase-architecture` | `9294510ab1d756357004812b372287bdde45d768f88da5e61c845ab05e10c1d3` |
| `pr` | `2ddfb7f87bdab9211993195b17ad783a07cbf7123331c9b8c982b46db8a9201a` |
| `prototype` | `3d18206932b45dfb2d4baea32d408b7b2253c0692d8cc5f620e248c652415e1e` |
| `research` | `2db34ef702e727c03bf0b4891aec444445ba7c49d59aa3885d7ec0954576d54b` |
| `retro` | `ff92628df87283428dfc08378a94d0faaa486f5d7717a29de1c789357710c5d8` |
| `setup-matt-pocock-skills` | `bc416f56e6f9549e9d028350d623a8ed3ec45103cf02dd1bd0cd199678256b4d` |
| `ship` | `08caadc617d9cc1b718715db47d7be48fe2fc929b2daa2ba70cedac7710c25e0` |
| `tdd` | `d22d6ae210dfd5506435fe01430119193b3cd8f800898b4b88481560749dc6c4` |
| `teach` | `7305fdbccb74d62d92ab8c6e0a33eea0708c6a0c379604728bfb9c29edbee937` |
| `to-questionnaire` | `835fb86bd786a8e50e405fbef3139e677d3cc30907740b39d079bbd0b520ff64` |
| `to-spec` | `63999e7876e94236d95c52d2edd1533b30a21a4444d42b7e913ead12dc53cd0f` |
| `to-tickets` | `4095fac29c58a43b8456b5531a2f1a5009606d945f6c73d97ad71955de52cca7` |
| `triage` | `9f53908a9ec4d0cbc2935f9f82363b728d7012765958f30779f6b759a5d783ee` |
| `wait-what` | `8c98c67cafa0cff6ccfbaf36e25d80a31771aaf7296c020d869eb4239b281411` |
| `wayfinder` | `e2fe4f2355147872ee562d9b8770487bf54b2e061cd038fee14262a3f331d5b6` |
| `wizard` | `3356c7f8f6f876bacec18d826e1b3a287c6c5cab4490cc54bd8fe94caae5a134` |
| `writing-for-agents` | `5b7bcfce01da1da89b005189d0f2a951bfed7cf4bbd592e376030940be4183aa` |
