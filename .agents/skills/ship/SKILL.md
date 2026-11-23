---
name: ship
description: "Take committed work to a merged PR or a local delivery. Use when the user asks to ship or deliver finished work, open its PR, get its CI green or merge it."
---

Deliver the committed work on the current branch.

The project's delivery route, required checks and merge authority should have been provided to you. If not, ask the user.

When the project settings call for verification and no verification report covers the current commit, have the verifier they name run the project's `verify-<app>` skill first. Deliver only on `PASS` or `PASS+NOTES`: a `FAIL` or `BLOCKED` verdict stops here, and so does a project with no verify skill, where the owner runs `create-verification-skill`.

1. Push the branch and open a PR. Call the Skill tool with "pr" to write its body. On a local route, skip to step 4.

2. Wait for the required checks on the PR head. When a check fails because of the change, fix it, run the affected tests, push and wait again. A flake earns one rerun; diagnose a second failure from its log. Report a blocker you cannot fix.

3. Merge only when the project lets you; otherwise stop and say what the owner decides. After a merge, confirm on the host that the PR is merged at the head you checked: a queued merge is not a merge.

4. On a local route, run the project's required checks. Merge the branch into its target only when the project lets you, and confirm the target points at the commit you checked.

5. Close the task the way the issue tracker closes work.
