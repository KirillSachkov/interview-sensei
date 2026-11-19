# Verification

Run `git diff --check` for changes and the affected behavioral checks as executable features are added.

## Appropriate evidence

For documentation or metadata changes, run structural checks and obtain independent review.
Check English/Russian meaning and owner actions during review; a link checker cannot do that.
For changed checker behavior, exercise a clean fixture and a fixture that should fail.
Record the observed failure and successful result rather than adding tests for prose wording.
For new executable behavior, add suitable regression tests as part of that issue.

Record client/model, source revision, task, expected result, actual outcome and limits.
Keep private transcripts outside the public repository.
A static pass does not establish live-agent adherence, semantic translation parity or product correctness.

## Fresh verification of the corrected result

Tests protect behavior. Review checks the implementation. Where the task requires an observable
scenario, a fresh agent that did not write the change verifies the corrected result after the
single review and correction pass. Follow the portable
[verification handoff](../../.agents/skills/implement/VERIFICATION.md).
Use the task's acceptance criteria, not a global feature inventory. For this documentation-only
example, an isolated synthetic walkthrough, an output table or an inspectable snippet can show
the outcome; no browser or application server is required. Ordinary prose-only changes need
structural checks and review, with a one-line reason when independent verification adds nothing.

For a bug fix to executable tooling, the fresh verifier independently confirms the expected
regression failure on the base and success on the corrected implementation in a disposable
context. A dependency/setup failure is unavailable evidence, not red proof.

Record base and corrected head, expected/observed outcomes, artifacts, data source and remaining
notes. A missing environment precondition is reported separately from a product failure. An
explicitly required scenario that cannot run remains an unmet delivery criterion. Never claim
coverage from another scenario. Later task edits need renewed verification of affected outcomes;
record untouched coverage and the new checked head. No additional code-review round is implied.
