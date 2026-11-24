# Interview Sensei

Before designing the first release, read the product brief in the [Wayfinder map](https://github.com/KirillSachkov/interview-sensei/issues/1).

## Language

Write to people in Russian: replies, issues, specs, PRs and reports. Write agent instructions and skills in English.
Change the English and Russian versions of a document together.

## Agent skills

### Issue tracker

GitHub issues through `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles under their own names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: terms in `DOMAIN.md`, decisions in `docs/adr/`. See `docs/agents/domain.md`.

### Delivery

PRs into `main`; every delivery waits for the owner. See `docs/agents/project-settings.md`.

### Workplace

Implement in a worktree of the task, never on `main` of the main checkout. The branch name carries the issue number.

### Testing

Take the seam from `docs/agents/testing.md`; for a kind of change it lacks, ask the owner once and add the row.
