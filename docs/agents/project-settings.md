# Project settings

## Read before implementing

- Workplace: worktree: implementation never starts on the base branch of the main checkout. The branch name carries the issue number.

## Read by `ship`

- Delivery route: pr, into `main`; a spec delivers its tickets through one integration PR
- Delivery checks: `git diff --check main...HEAD`, and `pnpm check`
- Required CI: the `harness-check` job on the PR head must be green
- After a merge: stop the Docker Compose stands started from the work's worktree with `docker compose -p <project> down -v`, stop the processes the work started by their PID, then remove the worktree and the local branch. `/deliver` does this with `orchestrator.py finish <ticket>`.
- Owner gate: owner: every delivery waits for the owner and the agent never merges on its own judgement

## Read at the verify step

- Verification: with the `verify-interview-sensei` skill, whenever user-visible behaviour changes or the task has key scenarios
- Verifier: a fresh agent that did not write the change
- Verification report: `.evidence/`

## Read by `pr`

- Evidence: results as text in the PR; once the application has a UI, screenshots attached to the PR, test data only, because the repository is public

## Read when choosing tests

- Testing strategy: docs/agents/testing.md

## Read by every skill: rules kept from the project

- After the owner approves a delivered head, in the PR or in a message, merge it with `gh pr merge <number> --squash --delete-branch --match-head-commit <approved-sha>`. A changed head needs a new approval. Green CI, an agent's review and an implementation start are not approvals. Record where the owner approved and the full SHA.
