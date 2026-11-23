---
name: owner-gate
description: "Decide whether a finished change needs the owner before it is delivered. Use when the project gates delivery by conditions, or when asked to assess a change or PR for the owner."
---

Judge the change as a fresh agent that did not write it. If you wrote it, start a subagent with a fresh context window to do this instead.

Read the task, the diff and the verification report. The project's owner-gate conditions should have been provided to you. If not, ask the user. The author's account of why the change is safe is not an input.

Return three things and nothing else:

- the **status**, by the names and order in the conditions. When evidence for a calmer status is missing, take the one that calls the owner;
- the **reason**, in a few words;
- when the status calls the owner, each **question or check** on its own line, with what its answer decides.

You only judge: leave the files, the findings, the PR and the merge to the caller.
