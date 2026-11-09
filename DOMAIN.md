# Interview preparation

## Terms

**Candidate**:
The person who prepares for an interview.

**Target**:
What the Candidate prepares for, shown as a preparation direction: a role and level, such as a middle Go developer.
A Target owns its Sources, Topics, Questions, Interview plan and progress. Targets do not share progress.
The Candidate creates and changes a Target together with the agent.
"New target" creates a draft Target at once, and the setup agent asks the first question.
A Target stores the agent that runs its Agent sessions; it starts as the agent from the application settings. A change applies only to new Agent sessions: a paused Mock interview and its Side threads keep their own agent.
The Candidate can archive a Target and restore it. Archiving is unavailable while an Agent session of the Target runs.
The Candidate can delete an archived Target for good after typing its name. Deletion erases its Sources, Questions, Attempts and Agent sessions.

**Interview plan**:
The ordered list of Sections that a full Mock interview for a Target goes through.
The agent proposes it from the Target's Sources and research; the Candidate changes it in conversation.

**Section**:
One part of an Interview plan, such as "Experience and resume", "Go and concurrency" or "System design". It has a Section kind, Topics and short grading criteria, and can be switched off.

**Section kind**:
How a Section runs and how its answers are graded. There are three: conversation, Questions on Topics, and design.
The product defines Section kinds; the Candidate and the agent compose Sections from them.

**Topic**:
An area of knowledge within a Target that its Sections check.

**Question**:
An interview question with its source and Topic.
_Avoid_: Task, when the item is not an algorithm problem.

**Mock interview**:
The only kind of interview: the agent acts as an interviewer and asks Questions for a Target.
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
The Candidate's correction of a Grade, with a required reason. The corrected Grade applies at once; the agent does not arbitrate.
A new correction replaces the previous one: the latest correction applies.

**Topic status**:
How well the Candidate knows a Topic within a Target: not started, shaky or confident.
Topic status follows from recent Attempts and is never set by hand. Confident needs recent Attempts without hints and at least one confident Deeper question.

**Readiness**:
The share of Topics with the confident Topic status in the enabled Sections of a Target.

**Inbox**:
Material that the Candidate added to a Target and the agent has not processed yet: links, files and video transcripts.
The Candidate adds material in the setup chat. The setup agent answers with a card of the material. Processing starts only after the Candidate confirms the card.
The agent processes it in the background: it creates Sources and adds Questions to Sections and Topics, then writes an Inbox report.
A Target has at most one processing at a time.
Inbox accepts files of any type up to 100 MB. If the agent extracts no text, the Source gets the error status with a reason.

**Inbox report**:
The agent's summary of one Inbox processing: what it processed, which Questions it added where, and which Questions it doubts.

**Preference**:
A rule the Candidate gave for a Target in plain language, with rejected Questions as examples, such as "fewer definitions, more applied questions".
Every Inbox processing and Mock interview for that Target follows the active Preferences. There is no memory shared between Targets.

**Side thread**:
A separate Agent session that branches from a Mock interview at a chosen moment, for clarification and explanation.
It starts from a Handoff brief, not from the whole session history. A Side thread cannot record Attempts or change Grades.
A Side thread opened before the Candidate answers the current Question marks that Attempt as received with a hint.
The Candidate can delete a Side thread for good; the hint mark on the Attempt stays.

**Handoff brief**:
The compact context a Side thread starts from: the Target, the current Question, the Candidate's answer and Follow-ups, the selected fragment and the Candidate's question. It never contains Grades the Candidate has not opened.

**Question rating**:
The Candidate's opinion of a Question itself: useful, irrelevant, or wrong.
_Avoid_: Grade, which assesses the Candidate's answer, not the Question.

**Agent session**:
One conversation of the application with the Candidate's agent: its kind, agent, ACP session id, status and event journal.
There are four kinds: Target setup, Inbox processing, Mock interview and Side thread. Each kind has its own skill, MCP tools and limits.
The server records every event in the journal; the chat and its history after a restart come from the journal, not from the agent's log.
The code calls it `AgentSession`. The agent check of the skeleton, «Проверка агента» in the UI, also runs in one; it is not a domain kind.
_Avoid_: Session, when the kind of session matters.

**MCP address**:
The URL of our MCP server that one Agent session gets in `session/new`, under a server name of its own. It offers the tools of the session kind and acts only on that session.
Only that session's agent gets it, and it closes when that agent stops.

**Permission request**:
The agent's request to perform an action, such as a shell command, with the options it offers.
The server answers requests for our own MCP tools; every other request goes to the Candidate in the chat.

**Source**:
Material attached to a Target: a vacancy, a resume, a link, a video transcript, a file or the Candidate's own note.
A Target can have any number of Sources of each type. Questions refer to the Sources they came from.
