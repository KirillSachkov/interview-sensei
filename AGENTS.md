# Interview Sensei

Session mode: worktree

Before planning or implementing work, read [the agreed scope](docs/requirements.ru.md).
This repository contains the open-source first version: a local interview-preparation layer over the user's own coding agent.
The closed second version, with its own agent and SaaS, lives in a separate private repository; keep its code and plans out of this one.

## Language

Human language: ru.

Use the selected language for replies, issues, specs, PRs and reports, including headings.
Keep executable syntax, identifiers and established technical terms intact.
Write agent instructions, skills and tool descriptions in English.
Russian is the only human language: PR titles and bodies, issues, specs, reports and human documentation.
Do not add English versions of human documents.
Agent tooling uses native `AGENTS.md`; do not add `CLAUDE.md`.

## Start and authority

Implementation starts when the owner explicitly selects `implement` or `implement-spec`, including ordinary language naming the skill.
For an unnamed implementation request, propose the entrypoint and wait for selection.
Preparation, issue labels and review comments do not start implementation.
An authorized spec run may delegate its agreed tickets.

Within started work, routine commits, push, PR updates and in-scope review/CI fixes may proceed.
Diagnosis alone does not authorize a fix.
Requirements changes need the owner’s decision.
Follow [delivery](docs/agents/delivery.md) for merge authority.

## Context pointers

- Before preparing work, read [requirements](docs/agents/requirements.md) and [human participation](docs/agents/human-review.md).
- Before writing files, read [worktree ownership](docs/agents/worktrees.md).
- Before domain work or exploration, read [domain guidance](docs/agents/domain.md).
- Before tests or review, read [testing](docs/agents/testing.md).
- Before Standards review, read [CODING_STANDARDS.md](CODING_STANDARDS.md).
- Before delivery, read [delivery](docs/agents/delivery.md).
- Before tracker operations, read [tracker](docs/agents/issue-tracker.md); before triage, read [label mappings](docs/agents/triage-labels.md).
- Before applying skills, read [runtime and provenance](.agents/skills/README.md).
- Before changing borrowed skills, read [upstream maintenance](docs/upstream.ru.md).
