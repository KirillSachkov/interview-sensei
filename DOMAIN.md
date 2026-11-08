# Interview preparation

Draft terms. Refine them with `grill-with-docs` before the first spec.

## Terms

**Candidate**:
The person who prepares for an interview.

**Target**:
What the Candidate prepares for, shown as a preparation direction: a role and level, such as a middle Go developer.
A Target owns its Sources, Topics, Questions, Interview plan and progress. Targets do not share progress.
The Candidate creates and changes a Target together with the agent.

**Interview plan**:
The ordered list of Sections that a full Mock interview for a Target goes through.
The agent proposes it from the Target's Sources and research; the Candidate changes it in conversation.

**Section**:
One part of an Interview plan, such as "Experience and resume", "Go and concurrency" or "System design". It has a Section kind and Topics, and can be switched off.

**Topic**:
An area of knowledge within a Target that its Sections check.

**Question**:
An interview question with its source and Topic.
_Avoid_: Task, when the item is not an algorithm problem.

**Mock interview**:
The only kind of session: the agent acts as an interviewer and asks Questions for a Target.
With a time limit, it follows the arc of a real interview, from general Questions to deeper ones. Without a limit, it continues until the Candidate stops it.
Stopping early keeps every recorded Attempt and still produces a Debrief.
_Avoid_: Training session; explanations happen in a Side thread instead.

**Follow-up**:
A clarification of the Candidate's current answer: "what did you mean", "give an example". It belongs to the same Attempt.

**Deeper question**:
A new Question that goes deeper into the same Topic after a confident answer. It gets its own Attempt, linked to the previous one.
The agent keeps going deeper until the Candidate becomes unsure, which shows how deep the Candidate knows the Topic.
_Avoid_: Question chain.

**Debrief**:
The review of an Attempt: its Grade, gaps and an outline of a strong answer. The Candidate opens it for any answered Question. At the end of a Mock interview, a summary Debrief shows Topic status changes and the next step.


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
A separate conversation that branches from a session at a chosen moment, for clarification and explanation.
It starts from a Handoff brief, not from the whole session history. A Side thread cannot record Attempts or change Grades.
A Side thread opened before the Candidate answers the current Question marks that Attempt as received with a hint.

**Handoff brief**:
The compact context a Side thread starts from: the Target, the current Question, the Candidate's answer and Follow-ups, the selected fragment and the Candidate's question. It never contains Grades the Candidate has not opened.

**Question rating**:
The Candidate's opinion of a Question itself: useful, irrelevant, or wrong.
_Avoid_: Grade, which assesses the Candidate's answer, not the Question.

**Source**:
Material attached to a Target: a vacancy, a resume, a link, a video transcript, a file or the Candidate's own note.
A Target can have any number of Sources of each type. Questions refer to the Sources they came from.
