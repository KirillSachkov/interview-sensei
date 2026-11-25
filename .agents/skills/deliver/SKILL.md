---
name: deliver
description: "Lead an agreed ticket or spec through the project's pipeline until it waits for the owner."
disable-model-invocation: true
---

Lead the ticket or spec the user named through the tasks in `docs/agents/pipeline.toml`, from its current stage to a stage no task starts from. If the pipeline file is missing, say so and stop.

`orchestrator.py`, beside this file, does the leading: it gives the ticket a worktree, starts one run per task in a fresh session of the client, runs each task's check and records the stage. You start it, answer for it and pass the owner's words on. Do none of the tasks yourself.

Call it by its path with Python 3.11 or newer, from the project root.

- **Start or continue:** `python3 orchestrator.py run <ticket> --detach`. A ticket the tracker holds is named by its reference; add `--spec` when it is a spec with tickets. A blocked ticket continues from the task that blocked it.
- **Follow:** after a start, stay with the ticket until its run ends. Call `python3 orchestrator.py wait <ticket>` again and again: each call returns when an attempt finishes or the run ends, and prints what finished and the status line. After each call tell the user in one line what happened; give a failed attempt's reason in plain words. If your client cuts a long call short, call it again: nothing is lost. Stop when the status line says `not running`. End your turn earlier only when the user asks to be left alone.
- **Models:** each task runs on the client, model and effort the pipeline gives it. When the user names others for this ticket, pass them at the start: `--model <model>` for every task, `--model <task>=<model>` for one, and `--agent` and `--effort` the same way. The ticket keeps them until it ends.
- **Status:** when asked, run `python3 orchestrator.py status` and say each ticket's stage, the running task and the last result.
- **Stop:** `python3 orchestrator.py stop <ticket>`. It returns when the run has ended.
- **Feedback on the result:** post the owner's words as a comment on the ticket's PR, then start the ticket with `--stage rework`.
- **Approval:** when the owner approves the result, call the Skill tool with "merge" for the ticket's PR: it merges at the head the owner checked and clears what the work left, as the project settings say. Then `python3 orchestrator.py finish <ticket>` marks the ticket done. Do the same when the owner drops the ticket instead: close its PR, clear by the same settings, then `finish`.
- **A changed ticket:** stop it, let the owner change the ticket in the tracker, then start it again.

## Findings outside the ticket

A defect or gap that you or a run found, and that the ticket's acceptance criteria do not cover, belongs in the issue tracker, not only in the chat. Tell the owner what you found, then file each one the way the tracker settings say, with how it was found and how to reproduce it, and give the links. Fix it within this ticket only when the owner says so: then it goes through `rework` like any other feedback.

## Report

When the run ends, say the stage the ticket ended in. For a stage that waits for the owner, give the PR link and what the owner decides.

For `blocked`, read the check output the failed attempt names, in the ticket's folder under `.factory/`. Say the task, the cause in plain words, whether the work or the environment failed, and what you would change. Change the project, the pipeline or the orchestrator only on the user's word.
