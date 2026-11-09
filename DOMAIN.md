# Interview preparation

## Terms

**Candidate**:
The person who prepares for an interview.

**Target**:
What the Candidate prepares for, shown as a preparation direction: a role and level, such as a middle Go developer.
A Target owns its Sources, Topics, Questions, Interview plan and progress. Targets do not share progress.
The Candidate creates and changes a Target together with the agent in a Target setup session.
A new Target starts as a draft, and the agent asks the first question in its Target setup session.
A Target stores the selected agent for its new Agent sessions. A Mock interview keeps its own agent, and its Side threads use that agent.
The Candidate can archive a Target, restore it, or delete an archived Target for good with all its data.

**Onboarding**:
The start of the Target setup session of a new draft Target. The agent speaks first: it asks for the position, the level, the vacancy, the resume and the Candidate's experience.
Then it builds the Target's name, level, Sections and Topics in the draft of changes. The first application with a name, a level and an enabled Section makes the Target active.

**Draft of changes**:
The changes of a Target that the agent of its Target setup session has recorded and the Candidate has not applied yet. The Target stays unchanged until then.
The Candidate sees the draft as a list in the chat and applies it as a whole, by a button or by agreeing in words; the agent applies it only after that agreement.
A Target has one draft of changes. It outlives the Agent session and a restart, so a Target is never changed halfway.
The draft holds one Interview plan: a new plan replaces the earlier one and keeps its Topic renames.
_Avoid_: Draft, alone: a new Target is a draft too.

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
A Topic merged into another one hands over its Questions and Attempts, so its progress counts there.

**Question**:
An interview question with its Topic, level and the Section kind it fits.
A Question from a Source refers to it and to the part of its text it came from, and may have a Reference answer.
_Avoid_: Task, when the item is not an algorithm problem.

**Reference answer**:
What a good answer to a Question contains: 3–5 key points and a short sample answer, with its origin and, for an answer from a Source, the Source and its part.
The origin is one of «из материала», «из интернета», «из знаний агента» and «проверен кандидатом».
Inbox processing writes a Reference answer only from the Source itself; a Question whose Source has no answer stays without one.

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
Topic status follows from recent Attempts of ended Mock interviews and is never set by hand: a running Mock interview's Attempts count once it ends. Confident needs recent Attempts without hints and at least one confident Deeper question.

**Readiness**:
The share of Topics with the confident Topic status in the enabled Sections of a Target.

**Inbox**:
The Sources of a Target that wait for Inbox processing, with the Source status «в Inbox».
The Candidate adds material in a Target setup session; the agent there proposes Inbox processing with a card, and only the Candidate's button starts it.

**Inbox processing**:
The background work on Sources of the Inbox: the server reads the text of each Source into numbered parts, then an Agent session of its own reads every part and adds Questions to the Topics of existing Sections.
It may create a Topic inside a Section, but never changes Sections or the Interview plan: it proposes them in the Inbox report.
A Target has at most one Inbox processing at a time; Sources added meanwhile wait for the next one.

**Source status**:
Where a Source is in Inbox processing: «в Inbox» until processing starts, «разбирается» during it, «готов» after it, or «ошибка» with the reason when the Source could not be read.

**Inbox report**:
The summary of one Inbox processing: the processed Sources, the added Questions by Section and Topic, the number of duplicates the server left out, the Questions the agent doubts, and its proposals of new Sections and Preferences.
The server counts the Sources, Questions and duplicates; the agent writes the summary, the doubts and the proposals.

**Preference**:
A rule the Candidate gave for a Target in plain language, with rejected Questions as examples, such as "fewer definitions, more applied questions".
Every Inbox processing and Mock interview for that Target follows the active Preferences. There is no memory shared between Targets.

**Side thread**:
A separate Agent session that branches from a Mock interview at a chosen moment, for clarification and explanation.
It starts from a Handoff brief, not from the whole Mock interview history. A Side thread cannot record Attempts or change Grades.
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
Inbox processing has no chat: the Candidate sees only the Source statuses and the Inbox report.
The server records every event in the journal; the chat and its history after a restart come from the journal, not from the agent's log.
The code calls it `AgentSession`. The skeleton's agent check also runs in one, but it is not a domain kind.
_Avoid_: Session, when the kind of session matters.

**MCP address**:
The URL of our MCP server that one Agent session gets in `session/new`, under a server name of its own. It offers the tools of the session kind and acts only on that Agent session.
Only that Agent session's agent gets it, and it closes when that agent stops.

**Permission request**:
The agent's request to perform an action, such as a shell command, with the options it offers.
The server answers requests for our own MCP tools.
Every other request goes to the Candidate in the chat, when the session kind asks the Candidate.
In a Mock interview and in Inbox processing it does not: they show no requests, so the server refuses them itself.

**Source**:
Material attached to a Target: a vacancy, a resume, a link, a video transcript, a file or the Candidate's own note.
A Target can have any number of Sources of each type. Questions refer to the Sources they came from.
The server reads the text of a Source itself, from PDF, DOCX, plain text, Markdown, subtitles and web pages, and keeps it in numbered parts in the data directory.
