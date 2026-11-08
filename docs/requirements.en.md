# Agreed scope

[Русский](requirements.ru.md)

Interview Sensei helps a person prepare for technical interviews with the coding agent they already use.
This document separates the open first version from the closed second version.

## Version 1: open source, local

Version 1 is a local layer over an existing agent, such as Claude Code or Codex.
The user's agent conducts the interview. The application stores data and shows progress.

Candidate capabilities, to be narrowed before the first spec:

- Mock interviews and training sessions run by the user's agent.
- Progress by topic, with the history of attempts.
- A question base with sources.
- Import of user-supplied material: links, transcripts, interview videos.
- Algorithm practice as a later increment.

Boundaries:

- No own LLM client, no provider API keys and no server accounts.
- Data stays on the user's device.
- Question research uses user-supplied or openly licensed sources. Leaked or scraped proprietary material is out of scope.

## Version 2: closed, separate repository

Version 2 builds its own agent: provider calls, tools, search, memory and the organisation around the agent.
It adds accounts and multi-user hosting and goes to production.
Version 2 is developed in a separate private repository. This repository may only link to it.

## Process

Every implementation has a bounded issue; full specs remain conditional.
The owner explicitly selects implementation. Independent implementations use separate worktrees.
Standards and Spec reviewers use fresh contexts. `ship` delivers a verified PR to the owner for acceptance.
Agent instructions remain English. Human work uses Russian.
