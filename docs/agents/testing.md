# Verification

This repository currently contains the harness: Markdown, skill metadata, client pointers and a small structural checker.
The application stack is not chosen yet. The first application issue adds its commands and tests here.

## Commands

Run from the repository root:

- `python3 scripts/check.py`: local Markdown links/anchors, skill identity and invocation metadata, directory hashes and client pointers.
- `git diff --check`: whitespace errors in the change.

Before a PR, run both commands and report their actual results.
CI runs the structural checker and whitespace check on the PR result.
`harness-check` is the job name; repository protection settings are not implied by its existence.

## Appropriate evidence

For documentation or metadata changes, run structural checks and obtain independent review.
Check the meaning of Russian text and owner actions during review; a link checker cannot do that.
For changed checker behavior, exercise a clean fixture and a fixture that should fail.
Record the observed failure and successful result rather than adding tests for prose wording.
For new executable behavior, add suitable regression tests as part of that issue.

Keep private transcripts and personal interview data outside the public repository.
A static pass does not establish live-agent adherence, semantic translation parity or product correctness.
