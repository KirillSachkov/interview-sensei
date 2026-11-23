# Interview Sensei

Before designing the first release, read the product brief in the [Wayfinder map](https://github.com/KirillSachkov/interview-sensei/issues/1).

## Language

Human language: ru.
Supported human languages: en, ru.
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

<!-- agent-kit project instructions -->
## Agent Kit

Read [project settings](docs/agents/project-settings.md) for delivery, verification and the owner gate. When the settings file is missing, tell the user to run the `setup-agent-kit` skill.
A standalone question ends with its answer.
Before choosing tests, read the testing strategy the settings name and take the seam from it. When it has none for this kind of change, ask the owner once and record the answer there.
When a skill names another skill, load it with your client's skill mechanism, or read its `SKILL.md` when the client has none.
Before implementing, read the workplace the settings name. When it is a worktree and you stand on the base branch of the main checkout, move to a worktree for the task first.
<!-- end agent-kit project instructions -->
