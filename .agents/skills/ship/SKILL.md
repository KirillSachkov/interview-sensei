---
name: ship
description: "Deliver assigned and reviewed work under the target project's rules. Use after implementation or when asked to deliver; the harness selects PR or main-checkout delivery, checks, acceptance and merge authority."
---

Read target root `AGENTS.md`, its delivery/testing/tracker/human-participation
pointers, and the assignment. Resolve the delivery mode and authority from them;
do not invent a fixed CI name, mandatory PR, owner handoff or deployment permission.

1. Check that the work matches the assignment and has required checks and
   independent review under the project's commit/review order. Record immutable
   checked commits or snapshot trees, findings and evidence limits.
2. Follow the selected mode. For a PR, push the owned branch, use `pr` for its body,
   create/update it through the tracker and follow draft timing. For a main-checkout flow,
   prepare its checked commit locally. Treat a push that publishes the finished change as
   the delivery action in step 5. If required pre-delivery evidence needs a remote run, use
   the project's authorized staging route or report the block.
3. Verify the required pre-delivery CI on the candidate revision. Earlier green, pending,
   missing or cancelled checks do not establish success. Fix in-scope failures, rerun affected
   checks and retain correction evidence. Do not send corrections back to reviewers unless the
   target explicitly requires another review. For pre-commit review, verify the delivered commit
   matches the frozen final content and retain the originally reviewed tree.
4. Confirm required fresh independent verification covers the corrected head and task scenarios,
   with inspected artifacts, observed outcomes and limits under the target's freshness rules.
   Keep environment limitations separate from product failures; unavailable coverage is not a pass.
   When the target enables classification, invoke its configured classifier (such as the optional
   `owner-attention` skill) once as a fresh read-only subagent, last after review dispositions,
   required verification and final checks. Supply the task, original Spec notes, dispositions,
   post-review changes, delivered revision, current verdict and limits, unresolved findings,
   final checks and target consequence/authority rules. It returns only the target's status,
   reason and any owner action. The caller records the result and applies any configured PR
   status or labels. If required classification cannot run, keep delivery pending and report it.
   Finish technical work before classification; apply target invalidation rules after later edits.
   Record unavailable tokens as unavailable when usage is requested. Preserve existing scoped
   permission and its provenance when relayed; classification grants only target-defined authority.
   Resolve human decisions due at this stage. Present the result, full delivered SHA,
   verification and its limits, and the owner's concrete next action when needed.
   Keep reviewed, accepted, merged and deployed states distinct.
5. Push to main, merge, deploy or publish only when the assignment and project gates
   authorize that concrete step. Follow required head guards, acceptance and queues.
   Verify any required post-delivery CI on the actual delivered revision. If a gate is
   pending, stop at the project's defined handoff and state what remains.
6. Retain or clean only owned resources under project lifecycle rules. Preserve active
   writers, unsaved work and unintegrated child results.
