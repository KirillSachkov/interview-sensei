# Project settings

## Read before implementing

- Workplace: worktree: implementation never starts on the base branch of the main checkout. The branch name carries the issue number.

## Read by `merge`

- Delivery route: pr, into `main`; a spec delivers its tickets through one integration PR
- Delivery checks: `git diff --check main...HEAD`, and `pnpm check`
- Required CI: the `harness-check` job on the PR head must be green
- After a merge, clear, unless the owner asked to keep a stand for testing:
  - the Compose stands started from the work's worktree, with their volumes: find them with `docker compose ls -a --format json` by a config path inside the worktree, stop each with `docker compose -p <name> down -v`
  - the processes started from the worktree: find them by a working directory inside it, stop each by its PID
  - the worktree, with `git worktree remove`, once it holds no uncommitted work
  - the work's branch, locally and on GitHub
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
