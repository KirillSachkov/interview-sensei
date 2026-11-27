---
name: verify-interview-sensei
description: Drive the Interview Sensei web app in a browser against an isolated Docker Compose stand and report a verdict with evidence. Use at the verify step, or when asked to prove that candidate-visible behaviour works at a commit.
---

# Verify Interview Sensei

The candidate touches one surface: the web page served by the API. A proof drives that page in a browser on a stand this run owns, checks what was stored, and leaves a report in `.evidence/`. The JSON API under `/api/` is public too; read it from the same browser, where the guest cookie lives.

Run every command from the worktree root. `S=.agents/skills/verify-interview-sensei/stand.sh`.

## Launch

Commit first: the stand is built from the working tree, and the report names a commit.

```bash
$S up                    # controlled model with scripted answers
$S up --model live       # a local Ollama this run starts; add --pull to download a missing model
```

`up` builds the image, starts `postgres`, `api` and `worker` from `compose.yaml` on an empty database, starts the model, runs the doctor and prints `Ready: <origin>`. It needs Docker and any `node` on `PATH`; `pnpm install` is not needed. Exit code 3 with a `BLOCKED:` line means the environment kept the stand from starting: write the report with `Verdict: BLOCKED` and that line. Exit code 1 means a defect, and `up` has already removed what it started.

`$S env` prints the stand's values: `PUBLIC_ORIGIN` is the address to open, `PROJECT` the Compose project.

**Isolation.** Each worktree gets one stand: the Compose project `sensei-verify-<folder>-<hash of the worktree path>`, a free host port for the page, and a private Compose address for the controlled model or a separate host port for live Ollama. Stands in different worktrees run side by side. A second `up` in the same worktree refuses; share the running stand through `$S env` or stop it with `$S down`.

### Which model

The app reaches its model at `OLLAMA_BASE_URL`, and the stand puts one of two things there.

- **Controlled** (default) answers from `replies.json` beside this skill, matching the candidate's message without regard to case. Use it for everything the product does around the model: the page, the dialogue and its restore, proposals and their versions, retries, sessions, the API contract. To script other messages, copy `replies.json` to `.scratch/`, add entries in the same shape (`changes`, optional `withdrawn`, `replyKind` of `conversation`, `proposal` or `reword_proposal`, `reply`) and start with `$S up --replies .scratch/<file>`. A message with no scripted answer makes the API return 503 and the page show «Ответ пока не получен. Можно повторить отправку.»
- **Live** is required when the scenario passes or fails on what the model decides: a change to the instruction or reply schema in `apps/server/src/modules/agent-execution/`, to the model settings, or an acceptance criterion about how a phrasing is understood. Quote the model's replies in the report. Without `ollama` on the machine, or without the model and `--pull`, the run is `BLOCKED`, never `FAIL`. The live path follows the README's local run and had no Ollama to run against when this skill was proved: the first live run should confirm it and fix `stand.sh` if it differs.

## Doctor

```bash
$S doctor
```

Read-only, one `ok` or `FAIL` line per check: the three services run in this project, the port is published by this project's `api`, the page answers 200, `PUBLIC_ORIGIN` matches, the worker is ready, the image was built from the current `HEAD`, tracked files are committed, the live model PID matches when using Ollama, and the `api` container reaches it. Run it whenever something looks off. On `FAIL  image was built from the current HEAD`, run `$S down` and `$S up` again.

## Drive

Drive with `agent-browser`, headless, in a session of your own. If the machine has an `agent-browser` procedure (`~/.agents/skills/agent-browser/SKILL.md`), take the extra flags from it and add them to every command.

```bash
B="$(agent-browser session id --scope worktree --prefix sensei-verify)"
E="$PWD/.evidence"
ORIGIN="$($S env | sed -n 's/^PUBLIC_ORIGIN=//p')"

agent-browser --session "$B" open "$ORIGIN"
agent-browser --session "$B" wait --text "Привет! Какая роль тебе интересна?"
agent-browser --session "$B" find label "Твоя реплика" fill "хочу на middle Go"
agent-browser --session "$B" find role button click --name "Отправить"
agent-browser --session "$B" wait --text "На каком рынке хочешь искать работу?"
agent-browser --session "$B" find label "Твоя реплика" fill "в России"
agent-browser --session "$B" find role button click --name "Отправить"
agent-browser --session "$B" wait --text "Предложение цели · версия 1"
agent-browser --session "$B" reload
agent-browser --session "$B" wait --text "Предложение цели · версия 1"
```

Handles on the page, all from `apps/web/src/goal-setup.tsx`:

| What | Handle |
| --- | --- |
| Heading | heading «К какому собеседованию хочешь подготовиться?» |
| Dialogue | `log` named «Диалог настройки»; the first list item is the greeting «Привет! Какая роль тебе интересна? …», then one item per turn |
| Input | textbox labelled «Твоя реплика» |
| Send | button «Отправить», disabled while the input is empty |
| Waiting | status «Ждём ответа…» |
| Proposal | region and heading «Предложение цели · версия N» with the goal text below |
| Failed turn | alert «Ответ пока не получен. Можно повторить отправку.», buttons «Повторить отправку» and «Изменить сообщение» |
| Stale draft | alert «Черновик обновился. Проверь его и подготовь новую реплику.», button «Вернуть текст в поле» |
| No workspace | alert «Не удалось открыть рабочую область.», button «Попробовать снова» |

Wait for the text you expect after every action; a live model may take up to 90 seconds per turn, so pass `--timeout 100000` to those waits. The guest is a cookie: the same session returns to its workspace, a session with another name opens an empty one. To stop or restart a service mid-scenario, use `docker compose -p "$PROJECT" kill|start|restart api` with the `PROJECT` from `$S env`.

## Evidence

Everything goes to `.evidence/` (git-ignored, absolute paths for `agent-browser`). Number the files in the order of the steps. For each step capture the action's result on the page and the state behind it:

```bash
agent-browser --session "$B" snapshot > "$E/03-proposal.txt"            # the page as text
agent-browser --session "$B" screenshot --full "$E/03-proposal.png"     # the page as the candidate sees it
$S capture 03-proposal                                                  # rows in PostgreSQL and the model call count
agent-browser --session "$B" network requests --filter api > "$E/03-requests.txt"
cat <<'EOF' | agent-browser --session "$B" eval --stdin > "$E/03-proposal-api.json"
fetch("/api/guest-workspace", { method: "POST" })
  .then((r) => r.json())
  .then(({ workspaceId }) =>
    fetch(`/api/workspaces/${workspaceId}/goal-setup`).then(async (r) => ({
      workspaceId, status: r.status, goalSetup: await r.json(),
    })))
EOF
```

`$S capture <label>` writes `.evidence/<label>-state.txt`: row counts, every stored turn with its message, reply, details, current question or proposal and graph path, and how many times the model was called. The controlled model also logs each call to `.evidence/model-calls.jsonl`; a live Ollama logs to `.evidence/ollama.log`.

Proof standards:

- Act through the page. The API and the database are for reading back what the page did.
- Capture before and after: a screenshot of the final screen alone proves nothing about the step that led to it.
- Check the side effect beside the visible result: the turn stored at the expected revision, the model called the expected number of times. A restore proves itself when the page shows the dialogue again and the model call count has not grown.
- The controlled model is the only stand-in, and it sits where the product already separates itself from the model. Say in the report which model the run used.
- Use synthetic data only; the repository is public and evidence may be attached to a PR.

## Report

Before cleanup, write the report in Russian to `.evidence/report.md`. For a pipeline attempt, also write this new report to `$FACTORY_REPORT`. Keep the two machine-readable lines in English:

```markdown
# Проверка: <what was verified>

Verdict: PASS
Commit: <output of git rev-parse HEAD>

Модель: управляемые ответы | Ollama <model>

- PASS — <what was driven> → <what was observed>. Свидетельства: `03-proposal.png`, `03-proposal-state.txt`
- FAIL — <what was driven> → <what was observed instead of what was expected>. Свидетельства: …

<notes for the owner, when the verdict is PASS+NOTES; the BLOCKED line, when blocked>
```

One line per scenario. The verdict is the worst outcome present: `FAIL` when the product misbehaved in any scenario; else `BLOCKED` when the environment kept any scenario from running (no Docker, no live model for a scenario that needs one); else `PASS+NOTES` when everything passed and the owner should still read something; else `PASS`. Return the same text as your answer.

## Cleanup

```bash
agent-browser --session "$B" close      # this session only
$S down
docker compose ls -a                    # this stand's project is absent; others are untouched
ls .evidence                            # the report and the evidence are still there
```

`down` saves the services' logs to `.evidence/stand-logs.txt`, removes this project's containers, volume and image, removes the controlled model service or stops the live model by its recorded PID, and deletes `.scratch/verify-stand/`. It is safe to repeat and runs after a failed attempt too. The next `up` moves an earlier run's `.evidence/` to `.scratch/previous-evidence/`.

## Helpers

- `stand.sh up [--model controlled|live] [--replies <file>] [--pull] | doctor | env | capture <label> | down`: the stand's lifecycle, as used above.
- `controlled-model.mjs --port <port> --replies <file> --calls <file>`: the scripted model; `stand.sh up` starts it.
- `replies.json`: the default scripted answers, keyed by the candidate's message.

The committed Playwright scenario (`e2e/guest.spec.ts`, part of `pnpm check`) builds its own stand and stays the regression test; this skill is for behaviour that has no committed scenario yet.
