---
name: ask
description: "Ask where you are and how best to proceed: which skill or flow fits, what size and shape the work needs, in which order to design, and when DDD, EventStorming or a board helps."
disable-model-invocation: true
---

# Ask

Before advising a route, read root `AGENTS.md` and the project settings it points at. Where advice here differs from project policy, the policy wins.

Answer like an experienced colleague: give the advice, the reason for it, and when it makes sense to depart from it. Advice is not a mandatory step or a template; the user decides.

This file is a map, not a manual. Before stating what a skill does or recommending a step be skipped, read that skill's `SKILL.md`.

## Which skill for which situation

| Situation | Skill |
| --- | --- |
| A new project, or its rules change | `/setup-agent-kit` |
| An idea to sharpen, in a repo | `/grill-with-docs` |
| An idea to sharpen, with no repo under it | `/grill-me` |
| An effort too big and foggy to hold in one session | `/wayfinder`, which ends in `/to-spec` |
| A design question only running code can answer | `/prototype` |
| The idea is clear and the build takes several sessions | `/to-spec`, then `/to-tickets` |
| A ticket is ready | `/implement`, then `/ship` |
| A spec with tickets is ready | `/implement-spec`, then `/ship` |
| A ticket or spec is ready and the owner wants only the PR | `/deliver`, when the project has `docs/agents/pipeline.toml` |
| Raw bugs and requests from others pile up | `/triage` |
| Something is broken and resists a first look | `/diagnosing-bugs` |
| The project has an app to drive and no way to verify behaviour | `/create-verification-skill` |
| A build is done, especially one that went sideways | `/retro` |
| The answer lives in someone else's head | `/to-questionnaire` |
| Reading legwork to delegate | `/research` |
| A step only a human can take | `/wizard` |
| A message did not land | `/wait-what` |
| The codebase needs upkeep between features | `/improve-codebase-architecture` |
| Moving work to another harness, folder or person | `/handoff` |
| Learning a concept over several sessions | `/teach` |

Work that fits one session needs a short conversation and a short ticket; the full interview and a spec are for more.

Tickets that `/to-tickets` produced are ready as they are: `/triage` is for work that arrives raw.

## Two ways to build

Both use the same skills and the same project settings, so a project can mix them ticket by ticket.

- **By hand.** The owner runs `/implement` or `/implement-spec` and stays in the session, then runs `/ship`. Choose it to take part in the work.
- **Whole.** `/deliver` leads the ticket through every task in the project's pipeline, each in a run of its own, and stops when the PR waits for the owner. Choose it to receive a finished PR.

Inside either, the agent reaches for these by itself: `/tdd` at the seams the testing strategy names, `/code-review` at the end of `/implement`, the project's `verify-<app>` skill before delivery when the settings call for verification, `/pr` to write the PR body, and `/owner-gate` when the project gates delivery by conditions.

## Where things are set

| What | Where |
| --- | --- |
| Delivery route, checks, verification, owner gate, workplace | `docs/agents/project-settings.md`, written by `/setup-agent-kit` |
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
