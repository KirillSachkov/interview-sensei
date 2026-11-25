# Project settings

## Read before implementing

- Workplace: <worktree: implementation never starts on the base branch of the main checkout | current checkout>

## Read by `ship`

- Delivery route: <local, main, pr, or the project's own rule>
- Delivery checks: <commands that must pass before delivery>
- Required CI: <checks that must be green on the PR head, or none>
- After a merge: <how the work's stands, worktree and branch are cleared, such as the commands or the machine's own tool>
- Owner gate: <owner: every delivery waits for the owner and the agent never merges | conditions: run `owner-gate` once before delivery against docs/agents/owner-gate.md; a status that needs no owner permits the merge | none: the agent may merge>

## Read at the verify step

- Verification: <when behaviour is verified>
- Verifier: <who verifies>
- Verification report: <local folder where the verifier leaves `report.md` and the evidence files, such as `.evidence/`>

## Read by `pr`

- Evidence: <where the PR stores the evidence files>

## Read when choosing tests

- Testing strategy: <docs/agents/testing.md, or the project's own document>

## Read by every skill: rules kept from the project

<each existing rule the owner kept where these skills do otherwise, with its file. Omit when there are none.>
