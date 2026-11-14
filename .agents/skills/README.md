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

## Project policy and provenance

All 28 common procedures, including `ask`, use the pinned Agent Kit selection. The only local procedure wrapper is the tiny explicit `ask-matt` compatibility alias pointing to `ask`; it has no duplicate flow. Native discovery is distinct from start authority: `implement` and `implement-spec` can be discovered by the model, but root `AGENTS.md` still requires the owner's explicit named start. No local installed copy is edited after installation.

Project policy lives in the harness: starts and language in root `AGENTS.md`; commit-first review and fresh integration/ticket correction implementers in `docs/agents/delivery.md`; confirmed test seams in `docs/agents/testing.md`; confirmed spec publication in `docs/agents/requirements.md`; diagnosis and prototype contexts in `docs/agents/worktrees.md`; domain filenames in `docs/agents/domain.md`; the five-part PR report in `docs/agents/human-review.md`.

Retain [Matt’s MIT notice](LICENSE.mattpocock), [HumanLayer’s MIT notice](LICENSE.humanlayer), [PR credits](pr/CREDITS.md), and each selected folder's `PROVIDER-NOTICES`. Historical adaptation notes and exact predecessor bytes remain in Git at the migration base recorded in [AGENT-KIT.md](AGENT-KIT.md). See [upstream maintenance](../../docs/upstream.ru.md).

## Content identity

SHA-256 per directory: sorted relative file paths encoded as UTF-8, NUL, file bytes, NUL.
Concatenate each entry and hash the result. Includes references and native metadata.
Hashes establish identity, not correctness or behavior.

| Skill | SHA-256 |
| --- | --- |
| `ask` | `834df1d799d2a699f1573622b7638f658452f9fb5d793a634613466fc4cd5f53` |
| `ask-matt` | `9aefa717ad1e2a4596b6c02f01e26513ff45121c3ec1773a2bb649094097b4c6` |
| `code-review` | `02be5e3aa804c4c27e932b75e36945347da0a8dd5ebc1a31eff3a9a247537e35` |
| `codebase-design` | `3e7a6c06845e4ffb1c9cb37fd65f2527cd221de46fb73608ad09ad6ff16558b8` |
| `diagnosing-bugs` | `a2d9088b9478c07a455784ed93ae3c7bad48c218b60749ceeb40fc0fd4becf6d` |
| `domain-modeling` | `e8342dda4d9ab58758f81e58eebe0b02f7051d4aae17c22b53d9798eed30c873` |
| `grill-me` | `a6ec48813bdf1bb1e4a5a2cc66d81e22227db0abf358538f473181ac4090e816` |
| `grill-with-docs` | `34bc2417bc28a1df79f539c24b5cc42e7b705694fc61082002c948580b14b626` |
| `grilling` | `b4d5e522b6280470e5174f377478a5a3233e7f5c8ae48e6426218ef9b1c70967` |
| `handoff` | `c7399aa1a73b8ce6a860a9aabc67f1f814e2e795a2729dccb303b6fbc0cf7d74` |
| `implement` | `70cff0cb9f2f18302dc0e4f911b5f99ef466551b4bbe9296fc3e4ecc8ebb3f47` |
| `implement-spec` | `5b2ebd2f45395fa080674165d084bf48d8fcb6d9b675401ee9ec2f4cb64bdb0a` |
| `improve-codebase-architecture` | `1d42b7ee376f762b159d1511825fd371b285fff74a745a42bfeb3d6dbff9bfd9` |
| `pr` | `5e58c5cedf9283a519851828f39c41348209d7f7a241375bd90054d2eae05b5b` |
| `prototype` | `a73333586976f87c64e48a059ebaa2a2f524543778cdd7bc3935c717b4e18826` |
| `research` | `2db34ef702e727c03bf0b4891aec444445ba7c49d59aa3885d7ec0954576d54b` |
| `retro` | `f7f9af2248691de80d6f3b73c84654a58fbde16a00f70bc165bfae38dfdc6b64` |
| `setup-matt-pocock-skills` | `af24c5730356d7c932afb1c27a756af9598bcb520b4ea32b3d5cadd2778c968e` |
| `ship` | `c0a783ce55f56c5d5a5c3eaf6b48e7fb5aaf05fe377e734ef1619c60f42ed0c4` |
| `tdd` | `ed44c9537d2fe453c2f930d216ad769217076be4edb6c47dde5f0be8e7bc5490` |
| `teach` | `7305fdbccb74d62d92ab8c6e0a33eea0708c6a0c379604728bfb9c29edbee937` |
| `to-questionnaire` | `835fb86bd786a8e50e405fbef3139e677d3cc30907740b39d079bbd0b520ff64` |
| `to-spec` | `051cf27c10b6e26e3091819b8b016c710a5d8a711b51b10901beccbf30183edb` |
| `to-tickets` | `4095fac29c58a43b8456b5531a2f1a5009606d945f6c73d97ad71955de52cca7` |
| `triage` | `50c0ae06f2076e80fecf86700e84d9c4213c3760a3de294849dc2410b7c1a019` |
| `wait-what` | `f1bdf06982e1e8de2c747c829e4aefd6de949b012cc6713e7fee31999b0704d1` |
| `wayfinder` | `74da3555d2bf91001c73028de1a665401f952fe24a0977a44eca058d1515a4f7` |
| `wizard` | `d237f15defb55f2c64a29695ec20bad980255e125e490f53ef248684f0b29d14` |
| `writing-for-agents` | `5b7bcfce01da1da89b005189d0f2a951bfed7cf4bbd592e376030940be4183aa` |
