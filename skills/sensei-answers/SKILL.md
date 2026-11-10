---
name: sensei-answers
description: Answer search procedure of Interview Sensei. Use for the whole answer search session: taking the Target's Questions from the server's queue, searching the web for what a good answer contains, writing each reference answer with its sources, and writing the answer report.
---

You fill reference answers for the interview Questions of one Target.
A reference answer tells the interviewer what a good answer contains: the Candidate's answers are graded against it.
A wrong reference answer spoils every later grade, so prefer a short correct answer to a long doubtful one.
You work in the background: nobody reads your messages, and nobody answers your questions or permission requests.
Everything the Candidate should know goes into the [report](#report).

## Steps

1. **Queue.** On «Answer search has started», call `next_questions_without_answer`.
   It gives the next Questions of the server's queue with their text, Topic, level and Section kind.
   `currentOrigin` is `agent` when the Question already has an answer from an agent's own knowledge: find a source for it.
2. **Search.** For each Question, search the web; see [Sources](#sources).
3. **Verify and write.** Check every point and the sample against the pages you read; see [Point checks](#point-checks).
   Write the checked answer with `save_reference_answer`; see [Answers](#answers).
   When you cannot answer a Question at all, skip it and name it with the reason in the report.
4. **Repeat.** Call `next_questions_without_answer` again until it returns no Questions.
5. **Report.** Call `write_answer_report` once; it finishes the answer search.
   Ending your turn without the report ends the search the same way, with a partial report.

A step is done when its tool call succeeds. A tool error names the rule it enforces: follow it and call again.
The server refuses to replace an answer «из материала» or one the Candidate checked: take the next Question.
The Candidate may stop the search at any time. The answers you wrote stay, so write each one as soon as it is ready.
Shell commands are not available.

## Sources

- Search once per Question, twice at most. The search spends the Candidate's subscription limits.
- Trust official documentation, language and framework specifications, RFCs, well-known engineering books and blogs of the tool's authors.
  Use well-known reference sites when the official source is silent.
- Avoid forums without an accepted answer, AI-generated pages, content farms and pages behind a login.
- Read the page itself before you cite it. Cite only pages that support the key points.

## Point checks

Before saving, match each factual claim in every point and in the sample to a passage on a page you read.
Check the API, runtime and version: preserve conditions, exceptions and the difference between a default and a caller-supplied value.
A page about a related API is not evidence for this API. For example, an abort error code of a Node stream does not establish the error code of `fetch`.
Narrow or remove a claim the passage does not support; within the search budget, open a more relevant source when needed.
Save `origin: "internet"` only when the cited pages support all factual claims, including the sample.
When support remains partial, use `origin: "agent"` without links only if you can give a reliable answer from your knowledge; otherwise skip and explain the uncertainty in `failed`.
Finish with a relevance pass over points and sample: remove clauses that do not help answer the specific Question at its level, even when true and sourced.
Keep 3–5 supported points rather than padding the answer with doubtful or optional details.

## Answers

- `points`: 3–5 key points that a strong answer contains, each one short sentence.
  Points name facts, mechanisms, trade-offs and the usual pitfalls needed to answer this Question at its level.
  Keep optional enrichment out of the points: more detail in a source must not silently raise the bar for Grade 3.
- `sample`: a short sample answer of 3–6 sentences, as a strong Candidate would say it in an interview.
- `origin` `internet` with `links`: the URLs of the pages that support the points: one to five, two or three are best.
- `origin` `agent` without `links`: when no reliable page supports the answer, write it from your own knowledge.
  Such an answer is a weaker hint; never give it a link you did not read.
- For a Question of kind `conversation`, about the Candidate's own experience, write what a strong answer shows, such as a concrete example, a personal contribution and the result.
- Write in the Target's language, which the opening names.

## Report

`write_answer_report` takes:

- `summary`: two or three sentences in the Target's language: how many answers you wrote and what was hard.
- `failed`: each Question you skipped, by id, with the reason, such as «вопрос о личном опыте» or «не нашёл надёжного источника».

The server adds the counts of written answers by origin and the token usage.
