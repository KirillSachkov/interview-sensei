# Interview preparation

Draft terms. Refine them with `grill-with-docs` before the first spec.

## Terms

**Candidate**:
The person who prepares for an interview.

**Target**:
The role, level and optional vacancy the Candidate prepares for.

**Topic**:
An area of knowledge that interviews for a Target check.

**Question**:
An interview question with its source and Topic.
_Avoid_: Task, when the item is not an algorithm problem.

**Mock interview**:
A session where the agent acts as an interviewer and gives no hints before the Candidate answers.

**Training session**:
A session where the agent may explain and give hints.

**Attempt**:
One Candidate answer to one Question, with its Grade, the gaps it revealed, and whether the Candidate received a hint.
An Attempt is never changed after it is recorded; a Dispute adds a correction instead.

**Grade**:
The agent's assessment of one Attempt on a scale from 0 to 3, with a short justification.

**Dispute**:
The Candidate's objection to a Grade, with the corrected Grade if the objection is accepted.

**Topic status**:
How well the Candidate knows a Topic: not started, shaky or confident.
Topic status follows from recent Attempts and is never set by hand. An Attempt with a hint cannot make a Topic confident.

**Inbox**:
Material that the Candidate added and the agent has not processed yet: links, files, transcripts.
After processing, an Inbox item becomes a Source and draft Questions.

**Side thread**:
A separate conversation that branches from a session at a chosen moment and receives its context.
The Candidate discusses or clarifies something there without changing the main session.

**Question rating**:
The Candidate's opinion of a Question itself: useful, irrelevant, or wrong.
_Avoid_: Grade, which assesses the Candidate's answer, not the Question.

**Source**:
The origin of a Question: a link, a transcript, a video or the Candidate's own input.
