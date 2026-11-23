---
name: ask
description: "Ask where you are and how best to proceed: which skill or flow fits, what size and shape the work needs, in which order to design, and when DDD, EventStorming or a board helps."
disable-model-invocation: true
---

# Ask

You don't remember every skill, so ask.

Answer like an experienced colleague: say where the work stands, the next step and the reason for it, the step after, and when it makes sense to depart from this advice. Advice is not a mandatory step or a template; the user decides.

This file is a map, not a manual. Before stating what a skill does or recommending a step be skipped, read that skill's `SKILL.md`.

## Read the situation first

Advice that ignores where the project stands sends the user back over ground already covered. Before answering, look:

- Root `AGENTS.md` and `docs/agents/project-settings.md`: the delivery route, verification, the owner gate and the workplace. Where advice here differs from project policy, the policy wins. No settings file means the first step is `/setup-project`.
- The work the user means. Read the ticket or spec in the tracker with its comments and blocking edges; for a spec, see which tickets are done, ready or blocked.
- Git and the host: the current branch, commits ahead of the base, an open PR and the state of its checks and reviews.
- `docs/agents/pipeline.toml`, when it exists: its tasks say what `/deliver` will do here. Run `orchestrator.py status` from the `deliver` skill's folder to see which tickets it is leading, at which stage, and what stopped them.
- Whether the project has a `verify-<app>` skill.

Then place the work on the main flow below and name the step it is at.

## The main flow: idea → ship

The route most work travels. You have an idea and want it built.

1. **`/grill-with-docs`** sharpens the idea by interview and keeps what it learns in the project glossary and ADRs. With no repo under the idea, use `/grill-me`. Work that fits one session needs only a short conversation and a short ticket.
2. **Branch: can every question be settled in conversation?** A question that needs a runnable answer (state, business logic, a UI you have to see) detours through **`/prototype`**, and its verdict comes back to the idea thread.
3. **Branch: is this a multi-session build?**
   - **Yes** → **`/to-spec`** turns the thread into a spec, then **`/to-tickets`** splits it into tracer-bullet tickets, each declaring its **blocking edges**.
   - **No** → one short ticket, or none, and straight to the build.
4. **Build and deliver.** Two ways, with the same skills and settings underneath, so a project can mix them ticket by ticket:
   - **By hand**, to take part in the work: **`/implement`** for one ticket, or **`/implement-spec`** for a whole spec, which runs implementer subagents across the ready **frontier** and lands everything on one **integration branch**. Then **`/ship`** takes the committed work to a PR, gets its checks green and stops where the owner gate says.
   - **Whole**, to receive a finished PR: **`/deliver`**, when the project has a pipeline. See Working with `/deliver`.

   Either way the code is built with **`/tdd`** at the seams the testing strategy names and closes with **`/code-review`**, a two-axis review (Standards and Spec): `/implement` reviews each ticket, `/implement-spec` reviews the integration branch once. When the settings call for verification, the project's `verify-<app>` skill runs on the reviewed work before delivery, and a `FAIL` or `BLOCKED` verdict keeps delivery open. **`/pr`** writes the PR body, and **`/owner-gate`** judges the change when the project gates delivery by conditions.
5. **The owner decides.** Feedback on the result goes on the PR; a change to what was asked goes on the ticket.
6. **`/retro`** closes the loop. After a build, and especially one that went sideways, it suggests changes to the agent's environment, not the code: mechanical mistakes become checks, judgement calls become coding standards.

## Working with `/deliver`

`/deliver <ticket>` starts an orchestrator that leads the ticket through the tasks in `docs/agents/pipeline.toml`, each in a run of its own, in a worktree of the ticket's own. It keeps going when the session that started it closes.

- **Where it is:** ask the session, or run the orchestrator's `status`: the stage, the running task and the last result of each ticket.
- **It stopped at `blocked`:** the status line names the task and the reason. Deal with the reason, then `/deliver` the same ticket: it continues from that task.
- **It reached `needs-owner`:** the PR waits. To ask for changes, comment on the PR and tell the session; the ticket goes through rework and delivery again.
- **Stop it:** tell the session, or run the orchestrator's `stop`. The stage is kept.

The skill's own `SKILL.md` has the commands. A project with no pipeline file builds by hand.

## On-ramps

A starting situation that generates work, then merges onto the main flow.

- **Bugs and requests piling up** → **`/triage`**. It moves raw issues through triage roles and produces agent-ready ones for the build step. Tickets that `/to-tickets` produced are ready as they are: don't triage them.
- **Something's broken** → **`/diagnosing-bugs`**, for the bug that resists a first look. It builds a tight feedback loop before theorising, then fixes with a regression test. Follow it with `/retro` to ask what would have prevented the bug.
- **A huge, foggy effort, too big for one session** → **`/wayfinder`**. It charts a shared map of decision tickets and resolves them one at a time, producing decisions, not deliverables. When the map clears it merges onto the main flow at `/to-spec`.

## Off the main flow

| Situation | Skill |
| --- | --- |
| A new project, or its rules change | `/setup-project` |
| The project has an app to drive and no way to verify behaviour | `/create-verification-skill` |
| The codebase needs upkeep between features | `/improve-codebase-architecture` |
| The answer lives in someone else's head | `/to-questionnaire` |
| Reading legwork to delegate | `/research` |
| A step only a human can take | `/wizard` |
| A message did not land | `/wait-what` |
| Moving work to another harness, folder or person | `/handoff` |
| Learning a concept over several sessions | `/teach` |

## Where things are set

| What | Where |
| --- | --- |
| Delivery route, checks, verification, owner gate, workplace | `docs/agents/project-settings.md`, written by `/setup-project` |
| Where and how the project tests | the testing strategy the settings name |
| What the reviewer holds code to | `CODING_STANDARDS.md`, grown by `/retro` |
| Words of the domain | the glossary, kept by `/domain-modeling` |
| The tasks of `/deliver`, and the client and model of each | `docs/agents/pipeline.toml` |
| The model of a session or of subagents | the client's own settings |
| Whether the agent may start a skill by itself | the skill's own flags; nothing in the project overrides them |

## Before the spec: size, order and practices

Questions that usually come up around steps 1–3 of the main flow. Read the linked reference before advising on them: it carries the reasons, the cases and the sources. Each reference has a Russian twin (`*.ru.md`) for the user to read.

- **Size and shape.** One spec covers one capability that is accepted as one result; work that fits one session needs a short issue, not a spec. A new product starts with a product document (problem, goals, first-version slice) plus language and boundaries, then one spec per capability. Bugs, refactors, migrations, integrations and technical changes each have their own shape: [WORK-SHAPES.en.md](WORK-SHAPES.en.md).
- **Design order.** Behaviour, quality, technical shape, unknowns, then `/to-spec`: the spec is the outcome of design. A spec that is ready but technically unthought gets its key scenarios walked through the modules, and the decisions go back into the spec, either in the earlier issue's body or as a new issue that links the earlier one and lists the criteria it replaces; the user chooses. A `/wayfinder` map ends with one `/to-spec` that consolidates its decisions: [DESIGN-ORDER.en.md](DESIGN-ORDER.en.md), and the [case behind it](CASE-SPEC48.en.md).
- **Practices.** Name the blocking question first, then pick the practice. Signs that one pays off: several actors or modules, failure branches, states, a word with two meanings. A small feature needs rules and two or three examples, not EventStorming. When each practice helps and when it does not: [PRACTICES.en.md](PRACTICES.en.md); terms: [DDD-GLOSSARY.en.md](DDD-GLOSSARY.en.md).
- **Boards.** When a board helps, which view answers which question, and when to offer one: [PRACTICES.en.md](PRACTICES.en.md#boards).

## Phase boundaries

A **phase** is a chunk of work inside a session: the grilling, the implementation, the QA. At the **boundary** between two of them you have five options, and picking between them is the fuzziest decision in this whole map:

- **Continue**: stay put. Costs nothing, loses nothing.
- **`/clear`**: empty the window, when nothing here matters to what's next.
- **`/handoff`** writes a portable markdown file. Narrow: only for a **new harness**, a **new directory**, a **colleague**, or forking a side task **mid-phase**. What it buys is portability.
- **Subagent**: send a tightly-scoped task to its own window and get a report back.
- **`/compact`** compresses this context and seeds a fresh session with it. An option when supported by the client and permitted by project context policy.

Read [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md) for the ordered tree: the five questions, the reasoning behind each branch, and why the primary-source cost makes **Continue** the one to rule out first. Make the decision **at** a boundary; mid-phase, continue or split the rest into subagents.

## Vocabulary underneath

Two references run beneath the other skills. Reach for them when the words, not the process, are the problem.

- `/domain-modeling` sharpens the project's domain language and records hard-to-reverse decisions as ADRs.
- `/codebase-design` is the vocabulary for a module's shape: depth, interface, seam.

`/grilling` is the interview the grilling skills run, and `/writing-for-agents` is the reference for documents agents read.
