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
After a restart or a crash of the agent, opening the Target setup continues the conversation: a new Agent session starts with the earlier chat, and its brief holds the draft and the last messages.
After «Завершить» the next Target setup session starts afresh.
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
An interview question with its source and Topic.
A Question that an agent made up without a Source, in a Mock interview or in Inbox processing, is unconfirmed («не подтверждён») until the Candidate confirms it.
A Question from material or one the Candidate applied through the draft of changes is confirmed.
Through the draft of changes, a new text, a move to another Topic or the useful Question rating confirms an unconfirmed Question; hiding it, another rating or a Topic merge does not.
_Avoid_: Task, when the item is not an algorithm problem.

**Mock interview**:
The only kind of interview: the agent acts as an interviewer and asks Questions for a Target.
The Candidate picks its Sections, a time limit and a difficulty: easier, as is or harder. The Target has no difficulty of its own: it is the difficulty of its latest Mock interview, which the next one offers first.
A Mock interview is running («идёт») until the Candidate finishes it («завершён»).
«Пауза», a crash of its agent and a server restart make it paused («на паузе»): its Agent session ends, its timer stops and the Presented question stays.
«Продолжить» starts a new Agent session of the same Mock interview with its agent, or with the Target's agent when its own is unavailable; the Mock interview keeps that agent from then on.
Its chat shows the journals of all its Agent sessions in order. The time limit counts only the time it runs.
A Target has at most one Mock interview that runs or is paused. Finishing a paused one gives the summary Debrief without the agent's summary.
Mock interviews that ended before pauses existed keep the status interrupted («прерван»); a new one never gets it.
With a time limit, it follows the arc of a real interview, from general Questions to deeper ones. Without a limit, it continues until the Candidate stops it.
Stopping early keeps every recorded Attempt and still produces a Debrief.
_Avoid_: Training session; explanations happen in a Side thread instead.

**Continuation summary**:
What the agent of a continued Mock interview learns of it in its brief: the current Section, the time left, the asked Questions in order with the Candidate's answers, Follow-ups and Grades, and the Presented question with what it waits for.
The server builds it from its own records, never from the agent's log; the Target, the Sections, the difficulty and the Preferences are in the rest of the brief.
The agent keeps Grades the Candidate has not opened out of the chat, as before the pause.

**Presented question**:
The Question that the agent of a Mock interview has shown and whose answer it awaits. A Mock interview has at most one: the next Question can be shown only after the Attempt of this one is recorded.
A Presented question still open when the Mock interview ends stays unanswered («без ответа»).

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
An Attempt the Candidate gave up with «Не знаю» is skipped («пропущено») and gets Grade 0.
An Attempt is never changed after it is recorded; a Dispute adds a correction instead.

**Grade**:
The assessment of one Attempt on a scale from 0 to 3, with a short justification.
The agent grades a free answer. The server grades a quiz answer by its correct options and gives a skipped Attempt 0; it explains these Grades itself.

**Dispute**:
The Candidate's correction of a Grade, with a required reason. The corrected Grade applies at once; the agent does not arbitrate.
A new correction replaces the previous one: the latest correction applies.

**Topic status**:
How well the Candidate knows a Topic within a Target: not started, shaky or confident.
Topic status follows from recent Attempts of ended Mock interviews and is never set by hand: the Attempts of a running or paused Mock interview count once it ends. Confident needs recent Attempts without hints and at least one confident Deeper question.

**Readiness**:
The share of Topics with the confident Topic status in the enabled Sections of a Target.

**Inbox**:
Material that the Candidate added to a Target and the agent has not processed yet: links, files and video transcripts.
The Candidate attaches material in a Target setup session; each attachment becomes a Source at once, with the status «в Inbox».
Inbox processing starts only after the Candidate confirms it.
The agent processes it in the background: it adds Questions to Sections and Topics, then writes an Inbox report.

**Inbox report**:
The agent's summary of one Inbox processing session: what it processed, which Questions it added where, and which Questions it doubts.

**Preference**:
A rule the Candidate gave for a Target in plain language, with rejected Questions as examples, such as "fewer definitions, more applied questions".
Every Inbox processing and Mock interview for that Target follows the active Preferences. There is no memory shared between Targets.

**Side thread**:
A separate Agent session that branches from a Mock interview at a chosen moment, for clarification and explanation.
It runs with the agent of its Mock interview; the code calls its kind `side-thread`.
It starts from a Handoff brief, not from the whole Mock interview history. A Side thread cannot record Attempts or change Grades.
A Side thread opened before the Candidate answers the current Question marks that Attempt as received with a hint, also while the Mock interview is paused.
After the answer, during Follow-ups, after the end of the Mock interview and on an earlier Question it gives no hint mark.
The interviewer never sees a Side thread: it learns only that the Candidate discussed the Question in one, at the start of its next message.
The Candidate opens a Side thread at a question card, at an interviewer message or at a Debrief, also of a past Mock interview, and may select a fragment to discuss.
A Side thread from an interviewer message discusses the Question that was shown when the message came; a message before the first Question opens none.
The Candidate can delete a Side thread for good; the hint mark on the Attempt stays.
When the Mock interview finishes, its Side threads whose agent waits for a message close; archiving the Target closes all of its Side threads.
A closed Side thread, and every Side thread after a restart or a crash of its agent, stays readable; «Продолжить» starts a new Agent session of the Side thread with the Mock interview's agent.
The new session's chat starts with the earlier one, and its Handoff brief holds the Side thread's earlier messages. Continuing never changes the hint mark.
Deleting a continued Side thread deletes every Agent session of its chat.

**Handoff brief**:
The compact context a Side thread starts from: the Target, the current Question, the Candidate's answer and Follow-ups, the selected fragment and the Candidate's question. It never contains Grades the Candidate has not opened.
Once the Candidate opened the Debrief of the Attempt, it also holds its Grade, gaps, justification and strong answer.
In a continued Side thread it also holds the Side thread's earlier messages.

**Question rating**:
The Candidate's opinion of a Question itself: useful, irrelevant, or wrong.
_Avoid_: Grade, which assesses the Candidate's answer, not the Question.

**Agent session**:
One conversation of the application with the Candidate's agent: its kind, agent, ACP session id, status and event journal.
There are four kinds: Target setup, Inbox processing, Mock interview and Side thread. Each kind has its own skill, MCP tools and limits.
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
In a Mock interview it does not: its chat shows no requests, so the server refuses them itself.

**Source**:
Material attached to a Target: a vacancy, a resume, a link, a video transcript, a file or the Candidate's own note.
A Target can have any number of Sources of each type. Questions refer to the Sources they came from.
