# Delivery and permissions

Use `ship` to deliver a committed, independently reviewed branch as a verified PR.
Use `pr` for its description in the language selected by root `AGENTS.md`.
The testing guide owns verification commands; the tracker guide owns GitHub operations.

## Issues and PRs

Each implementation issue links to a PR that targets `main`.
A discussion or research issue without repository changes may resolve with an answer.
For a small task or ticket PR, the draft follows local checks and committed independent review.
A ready PR requires checks and review covering the current change.
Keep issues open until delivery criteria are met, normally by merge.

## Delivery modes

The spec's «Приёмка» section names its mode under [human participation](human-review.md#level-2-every-spec).

- Ticket PRs, the default: one PR per ticket. Run each ticket through `implement`. Start the next ticket from fetched `main` after the owner accepts and merges the previous PR. The spec issue closes after its last ticket PR merges.
- Integration PR: one PR through `implement-spec` closes the spec and its tickets. Choose it only when tickets cannot be demonstrated or kept green separately; the spec states the reason. Ticket work uses an integration branch, and its draft follows the first integrated result.

### Ticket review

In integration PR mode, the spec's «Приёмка» section names when independent review runs: after each ticket or after all tickets.
If the spec names neither, review runs after all tickets.
Ticket PR mode keeps its rule: each ticket PR gets independent review through `implement`.

- After each ticket: once the ticket is integrated and project checks pass, the orchestrator calls `code-review` on the ticket diff.
  That diff runs from the integration tip before the ticket to the ticket's integrated head.
  A fresh implementer fixes findings, and a repeated `code-review` checks the fixes.
  The ticket's checkpoint report follows this review and includes its result.
- After all tickets: no review per ticket.

In both choices, the full-diff review before final acceptance remains.

### Checkpoints

In integration PR mode, the spec's «Приёмка» section may name checkpoints after tickets.
At a checkpoint, integrate the ticket and pass project checks first.
If the spec chose review after each ticket, pass the [ticket review](#ticket-review) next.
Then the orchestrator posts the [five-part report](human-review.md#level-1-every-pr) in the ticket and in the draft PR.
Then wait for the owner's reply: accepted, or remarks.
Tickets that depend on the checked ticket wait; independent tickets continue under [Ask the owner](human-review.md#ask-the-owner).

### Owner remarks

Fix owner remarks at a checkpoint or on a ticket PR within the same ticket.
Then post a new five-part report and wait for the owner again.

## Verification evidence

Follow [testing](testing.md) before delivery.
Checks and independent review must cover the delivered contents and accepted requirements.
Retain the initial full-diff review when later passes check only corrections and affected interactions.
Resolve blocking findings; keep optional suggestions and disputed decisions visible in the issue or PR.
Optional redesign does not expand the assignment.
For disputes, scope changes or corrections that stop making progress, follow [Ask the owner](human-review.md#ask-the-owner).
Apply these rules to agent and human findings within the active assignment.

After updating from the intended target, record a new immutable merge-base and review the complete resulting PR diff.
Include relevant interactions and conflict resolutions; retain earlier reports and checked endpoints.
New code or requirements need affected checks and review again.
Delivery requires successful CI on the current PR result.
Failures remain blockers until resolved.
Report unrelated failures and propose a separate implementation rather than expanding the assignment.

## Acceptance and merge

Every final PR goes to the owner for acceptance under [human participation](human-review.md).
Merge requires the owner’s explicit approval of the delivered head; an agent records its source and full SHA.
The owner may approve in the PR or in a message to the agent.
Use `gh pr merge <number> --squash --match-head-commit <approved-sha>` for an authorized merge.
A changed head needs renewed approval.
Agent review, an implementation start and green CI do not independently grant merge permission.
Never write an approval as if the owner authored it.
Shared-account authorship does not prove human approval; use the owner’s actual communication.

Inspect repository settings before claiming a check is required or a branch is protected.
This initial example does not install rulesets, automated approvals, deployment or auto-merge.
Retain the PR worktree for acceptance and clean only owned resources.
