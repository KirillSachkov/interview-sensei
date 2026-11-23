# Interview Sensei

Before designing the first release, read the product brief in the [Wayfinder map](https://github.com/KirillSachkov/interview-sensei/issues/1).

## Language

Human language: ru.
Use the selected language for replies, issues, specs, PRs and reports, including headings.
Keep executable syntax, identifiers and established technical terms intact.
Write agent instructions, skills and tool descriptions in English.
Maintain English and Russian human documentation together; neither translation expands the agreed scope.

## Agent skills

### Issue tracker

GitHub issues through `gh`; agent-written messages carry an authorship prefix. See `docs/agents/issue-tracker.md`.

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
