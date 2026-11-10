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
An interview question with its Topic, level and the Section kind it fits.
A Question from a Source refers to it and to the part of its text it came from, and may have a Reference answer.
A Question that an agent made up without a Source, in a Mock interview or in Inbox processing, is unconfirmed («не подтверждён») until the Candidate confirms it.
A Question from a Source or one the Candidate applied through the draft of changes is confirmed.
Through the draft of changes, a new text, a move to another Topic or the useful Question rating confirms an unconfirmed Question; hiding it, another rating or a Topic merge does not.
Outside the draft, 👍, the useful Question rating, confirms it too.
A Question that Inbox processing added is new («новый») until the Candidate marks the Questions of its Inbox report as seen.
The Candidate hides, deletes, rates ⚠ or 👍 several Questions at once. Deleting a Question with Attempts hides it instead, so its history stays.
_Avoid_: Task, when the item is not an algorithm problem.

**Reference answer**:
What a good answer to a Question contains: 3–5 key points and a short sample answer, with its origin and, for an answer from a Source, the Source and its part.
The origin is one of «из материала», «из интернета», «из знаний агента» and «проверен кандидатом».
Inbox processing writes a Reference answer only from the Source itself; a Question whose Source has no answer stays without one.

**Mock interview**:
The only kind of interview: the agent acts as an interviewer and asks Questions for a Target.
The Candidate picks its Sections, a time limit and a difficulty: easier, as is or harder. The Target has no difficulty of its own: it is the difficulty of its latest Mock interview, which the next one offers first.
A Mock interview is running («идёт») until the Candidate finishes it («завершён»).
«Пауза», a crash of its agent and a server restart make it paused («на паузе»): its Agent session ends, its timer stops and the Presented question stays.
«Продолжить» starts a new Agent session of the same Mock interview with its agent, or with the Target's agent when its own is unavailable; the Mock interview keeps that agent from then on.
Its chat shows the journals of all its Agent sessions in order. The time limit counts only the time it runs.
A Target has at most one Mock interview that runs or is paused. Finishing a paused one gives the summary Debrief without the agent's summary.
A pause while the agent writes its summary after «Завершить» drops that request: the continued Mock interview runs as before «Завершить», so «Пауза» and «Завершить» work again.
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
The Sources of a Target that wait for Inbox processing, with the Source status «в Inbox».
The Candidate attaches material in a Target setup session; each attachment becomes a Source at once, with the Source status «в Inbox».
The agent there proposes Inbox processing with a card, and only the Candidate's button starts it.

**Inbox processing**:
The background work on Sources of the Inbox: the server reads the text of each Source into numbered parts, then an Agent session of its own reads every part, adds Questions to the Topics of existing Sections and writes an Inbox report.
It may create a Topic inside a Section, but never changes Sections or the Interview plan: it proposes them in the Inbox report.
A Target has at most one Inbox processing at a time, a Recheck included; Sources added meanwhile wait for the next one.
«Остановить разбор», a failed agent, an agent that ended its work without the Inbox report, or a restart of the server ends it early; so does a start where the server could not read any Source.
Then the Questions already added stay, a Source whose every part the agent read becomes «готов», the other Sources «разбирается» go back to the Inbox, and the server writes a partial Inbox report.
The agent's own Inbox report moves the Sources by the same rule: a Source the agent did not read to its last part goes back to the Inbox.

**Source status**:
Where a Source is in Inbox processing: «в Inbox» until processing starts, «разбирается» during it, «готов» after it, or «ошибка» with the reason when the Source could not be read.
A video or audio file is «транскрибируется» with the percent heard while the server recognizes its speech on the Candidate's device, before the agent starts (#74); then it is «разбирается» with the recognized text.
So is a link to a video whose speech the server recognizes; a video with subtitles in its language goes straight to «разбирается» with their text (#76).
«Остановить разбор» and a restart cancel the recognition and return the file to the Inbox; a recognized text stays with the Source, so the next processing does not recognize it again.
The server gives «ошибка» to a format it cannot read, archives included, to a Source without text, to a video or audio file without installed speech recognition, without a model for its language or without sound, to a link to a video that is private, deleted or open only after a login, and to a link to a video hosting before yt-dlp is downloaded.
A Bound transcript gives a video or audio file its text without recognition.
A web page the server could not read stays «разбирается» without parts: the agent opens it on the web, and its Questions have no part.
It becomes «готов» by the agent's Inbox report and goes back to the Inbox when processing ends without one.
The agent gives «ошибка» with its reason to a Source it cannot read either.

**Inbox report**:
The summary of one Inbox processing: the processed Sources, the added Questions by Section and Topic, each with its Source, the part and the reference answer, the number of duplicates the server left out, the Questions the agent doubts, and its proposals of new Sections and Preferences; for a Recheck, the list «скрыть?».
The server counts the Sources, Questions and duplicates; the agent writes the summary, the doubts and the proposals.
When the agent did not read every part of some Sources, the server adds to its summary how many went back to the Inbox.
A partial Inbox report comes from the server when Inbox processing ended without the agent's report: its summary says why and how many Sources were read to the end, and it has no doubts or proposals.
A Target keeps every Inbox report as its history.

**Recheck**:
An Inbox processing of the Target's Questions instead of Sources, against its active Preferences, after the Candidate added or changed a Preference.
The agent of the Target setup proposes it with a card, and only the Candidate's button starts it.
It changes nothing itself: its Inbox report lists Questions to hide («скрыть?») with reasons, and the Candidate hides the ones they accept.

**Preference**:
A rule the Candidate gave for a Target in plain language, with rejected Questions as examples, such as "fewer definitions, more applied questions".
Every Inbox processing and Mock interview for that Target follows the active Preferences. There is no memory shared between Targets.

**Side thread**:
A separate Agent session that branches from a Mock interview at a chosen moment, for clarification and explanation.
It runs with the agent of its Mock interview, unless the Candidate continues it with the Target's agent; the code calls its kind `side-thread`.
It starts from a Handoff brief, not from the whole Mock interview history. A Side thread cannot record Attempts or change Grades.
A Side thread opened before the Candidate answers the current Question marks that Attempt as received with a hint, also while the Mock interview is paused.
After the answer, during Follow-ups, after the end of the Mock interview and on an earlier Question it gives no hint mark.
The interviewer never sees a Side thread: it learns only that the Candidate discussed the Question in one, at the start of its next message.
The Candidate opens a Side thread at a question card, at an interviewer message or at a Debrief, also of a past Mock interview, and may select a fragment to discuss.
A Side thread from an interviewer message discusses the Question that was shown when the message came; a message before the first Question opens none.
The Candidate can delete a Side thread for good; the hint mark on the Attempt stays.
When the Mock interview finishes, its Side threads close unless their agent is working: those that wait for a message and those that a restart or a crash stopped. Archiving the Target closes all of its Side threads.
A closed Side thread stays readable and takes no more messages, so it cannot be continued, also after the Target returns from the archive.
After a restart or a crash of its agent, a Side thread that is not closed stays readable, and «Продолжить» starts a new Agent session of it with the Mock interview's agent, or with the Target's agent when the Mock interview's one is unavailable; the Mock interview keeps its own agent.
The new session's chat starts with the earlier one, and its Handoff brief holds the Side thread's earlier messages. Continuing never changes the hint mark.
Deleting a continued Side thread deletes every Agent session of its chat.

**Handoff brief**:
The compact context a Side thread starts from: the Target, the current Question, the Candidate's answer and Follow-ups, the selected fragment and the Candidate's question. It never contains Grades the Candidate has not opened.
Once the Candidate opened the Debrief of the Attempt, it also holds its Grade, gaps, justification and strong answer.
In a continued Side thread it also holds the Side thread's earlier messages.

**Question rating**:
The Candidate's opinion of a Question itself: useful (👍), irrelevant, or wrong (⚠), with the Candidate's optional comment for wrong.
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
Inbox processing may use the web, so its agent opens pages without a request.

**Source**:
Material attached to a Target: a vacancy, a resume, a link, a video transcript, a file or the Candidate's own note.
A Target can have any number of Sources of each type. Questions refer to the Sources they came from.
The server reads the text of a Source itself, from PDF, DOCX, plain text, Markdown, subtitles and web pages, recognizes the speech of video and audio files, takes the subtitles or the speech of a linked video, and keeps the text in numbered parts in the data directory.

**Bound transcript**:
A file of subtitles or plain text attached to the same Target with the file name of a video or audio file, in any case, such as `interview.vtt` beside `interview.mp4` (#74, the owner's decision in PR #92).
The video takes its text instead of recognizing its speech, so it needs no model and no download.
The transcript goes into the video's Inbox processing and follows the video: it becomes «готов» only with the video and goes back to the Inbox with it. The agent reads it as the video's text, never as a Source of its own.

**Speech recognition**:
The application's own recognition of speech in video and audio on the Candidate's device (#74), with no agent: ffmpeg-static extracts the sound, Silero VAD cuts it into phrases, and a speech model recognizes them through sherpa-onnx.
The Candidate chooses the model: GigaAM v3 for Russian, Parakeet TDT 0.6B v3 for 25 European languages, or both.
The language of a file is the Target's language unless the Candidate changes it in the processing card; Russian goes to GigaAM when it is installed, otherwise to Parakeet, and the other languages of Parakeet to Parakeet.
A link goes through yt-dlp (#76): one it does not recognize is a web page; a video gives its manual subtitles in its language, the automatic ones when it is Russian and GigaAM is not installed, or else the speech of its original audio track.
Its components download only after the Candidate's consent, into the data directory, at pinned versions with checked SHA-256; nothing is installed into the system.
«Настройки» → «Распознавание речи» shows each model's status, installs a model and deletes one, which frees its disk space.
