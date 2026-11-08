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
The only kind of session: the agent acts as an interviewer and asks Questions for a Target.
With a time limit, it follows the arc of a real interview, from general Questions to deeper ones. Without a limit, it continues until the Candidate stops it.
Stopping early keeps every recorded Attempt and still produces a Debrief.
_Avoid_: Training session; explanations happen in a Side thread instead.

**Follow-up**:
A clarifying question the agent asks about the current Question. Its answer belongs to the same Attempt.

**Debrief**:
The review of an Attempt: its Grade, gaps and an outline of a strong answer. The Candidate opens it for any answered Question. At the end of a Mock interview, a summary Debrief shows Topic status changes and the next step.

**Interview format**:
The structure of a Mock interview: for example, Questions on Topics in a row, a talk based on the Candidate profile, or a system design discussion.

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
