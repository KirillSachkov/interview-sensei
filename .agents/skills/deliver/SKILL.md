---
name: deliver
description: "Lead an agreed ticket or spec through the project's pipeline until it waits for the owner."
disable-model-invocation: true
---

Lead the ticket or spec the user named through the tasks in `docs/agents/pipeline.toml`, from its current stage to a stage no task starts from. If the pipeline file is missing, say so and stop.

`orchestrator.py`, beside this file, does the leading: it gives the ticket a worktree, starts one run per task in a fresh session of the client, runs each task's check and records the stage. You start it, answer for it and pass the owner's words on. Do none of the tasks yourself.

Call it by its path with Python 3.11 or newer, from the project root.

- **Start or continue:** `python3 orchestrator.py run <ticket> --detach`, then `python3 orchestrator.py wait <ticket>` in the background. A ticket the tracker holds is named by its reference; add `--spec` when it is a spec with tickets. Tell the user the ticket has started and end your turn. A blocked ticket continues from the task that blocked it.
- **Models:** each task runs on the client, model and effort the pipeline gives it. When the user names others for this ticket, pass them at the start: `--model <model>` for every task, `--model <task>=<model>` for one, and `--agent` and `--effort` the same way. The ticket keeps them until it ends.
- **Status:** when asked, run `python3 orchestrator.py status` and say each ticket's stage, the running task and the last result.
- **Stop:** `python3 orchestrator.py stop <ticket>`. It returns when the run has ended.
- **Feedback on the result:** post the owner's words as a comment on the ticket's PR, then start the ticket with `--stage rework`.
- **A changed ticket:** stop it, let the owner change the ticket in the tracker, then start it again.

## Report

When the orchestrator ends, say the stage the ticket ended in. For a stage that waits for the owner, give the PR link and what the owner decides. For `blocked`, give the task, the reason and the session to reopen from the status line.
