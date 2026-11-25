#!/usr/bin/env bash
# One verification stand per worktree: a Compose project, a published port and a model, all owned by this run.
#
#   stand.sh up [--model controlled|live] [--replies <file>] [--pull]
#   stand.sh doctor
#   stand.sh env
#   stand.sh capture <label>
#   stand.sh down
#
# Exit codes: 0 done, 1 the stand or the skill is broken, 3 BLOCKED by the environment.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(git -C "$here" rev-parse --show-toplevel)"
scratch="$root/.scratch/verify-stand"
evidence="$root/.evidence"
state="$scratch/state.env"
slug="$(basename "$root" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9\n' '-' | cut -c1-24)"
PROJECT="sensei-verify-${slug}-$(printf '%s' "$root" | git hash-object --stdin | cut -c1-6)"

say() { printf '%s\n' "$*"; }
die() {
  say "ERROR: $*" >&2
  exit 1
}
blocked() {
  say "BLOCKED: $*" >&2
  exit 3
}
compose() {
  docker compose -p "$PROJECT" --project-directory "$root" -f "$root/compose.yaml" "$@"
}
free_port() {
  node -e 'const s=require("node:net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}
remember() { printf '%s=%s\n' "$1" "$2" >>"$state"; }
load() {
  [ -f "$state" ] || die "no stand is recorded for this worktree; run: $0 up"
  # shellcheck disable=SC1090
  . "$state"
  export HTTP_PORT PUBLIC_ORIGIN OLLAMA_BASE_URL OLLAMA_MODEL
}
model_alive() {
  [ -n "${MODEL_PID:-}" ] && [ -n "${MODEL_MARK:-}" ] &&
    ps -p "$MODEL_PID" -o command= 2>/dev/null | grep -qF -- "$MODEL_MARK"
}
model_calls() {
  if [ "$MODEL_MODE" = controlled ]; then
    [ -f "$evidence/model-calls.jsonl" ] && wc -l <"$evidence/model-calls.jsonl" | tr -d ' ' || echo 0
  else
    grep -c 'POST.*/api/chat' "$evidence/ollama.log" || true
  fi
}
model_reachable_from_api() {
  if [ "$MODEL_MODE" = controlled ]; then
    compose exec -T api node -e 'fetch(process.env.OLLAMA_BASE_URL+"/health").then(r=>r.json()).then(j=>process.exit(j.controlled?0:1)).catch(()=>process.exit(1))'
  else
    compose exec -T api node -e 'fetch(process.env.OLLAMA_BASE_URL+"/api/tags").then(r=>r.json()).then(j=>process.exit(j.models.some(m=>m.name===process.env.OLLAMA_MODEL)?0:1)).catch(()=>process.exit(1))'
  fi
}

teardown() {
  if [ -f "$state" ]; then
    # shellcheck disable=SC1090
    . "$state"
  fi
  if [ -n "$(compose ps -aq 2>/dev/null)" ]; then
    mkdir -p "$evidence"
    compose logs --no-color >"$evidence/stand-logs.txt" 2>&1 || true
  fi
  compose down -v --rmi local --remove-orphans >/dev/null 2>&1 || true
  if [ -n "${MODEL_PID:-}" ] && model_alive; then
    kill "$MODEL_PID" 2>/dev/null || true
  fi
  rm -rf "$scratch"
  if docker compose ls -a --format json 2>/dev/null | grep -q "\"$PROJECT\""; then
    die "Compose project $PROJECT is still listed; inspect it with: docker compose -p $PROJECT ps -a"
  fi
  say "Stand $PROJECT removed. Evidence kept in $evidence"
}

start_controlled_model() {
  MODEL_PORT="$(free_port)"
  MODEL_MARK="controlled-model.mjs --port $MODEL_PORT"
  nohup node "$here/controlled-model.mjs" --port "$MODEL_PORT" --replies "$replies" \
    --calls "$evidence/model-calls.jsonl" >"$scratch/model.log" 2>&1 &
  MODEL_PID=$!
  remember MODEL_PID "$MODEL_PID"
  remember MODEL_MARK "\"$MODEL_MARK\""
  local probe="http://127.0.0.1:$MODEL_PORT/health"
  for _ in $(seq 1 50); do
    curl -fsS -m 2 "$probe" >/dev/null 2>&1 && break
    sleep 0.2
  done
  curl -fsS -m 2 "$probe" >/dev/null || die "the controlled model did not start; see $scratch/model.log"
  OLLAMA_BASE_URL="http://host.docker.internal:$MODEL_PORT"
  OLLAMA_MODEL="controlled-goal-setup"
}

start_live_model() {
  command -v ollama >/dev/null || blocked "ollama is not installed, so no live model can be started"
  OLLAMA_MODEL="${OLLAMA_MODEL:-qwen3:4b}"
  MODEL_PORT="$(free_port)"
  local bind=127.0.0.1
  if [ "$(uname -s)" = Linux ]; then
    bind="$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}')"
  fi
  MODEL_MARK="ollama serve"
  OLLAMA_HOST="$bind:$MODEL_PORT" OLLAMA_NO_CLOUD=1 nohup ollama serve >"$evidence/ollama.log" 2>&1 &
  MODEL_PID=$!
  remember MODEL_PID "$MODEL_PID"
  remember MODEL_MARK "\"$MODEL_MARK\""
  for _ in $(seq 1 100); do
    curl -fsS -m 2 "http://$bind:$MODEL_PORT/api/version" >/dev/null 2>&1 && break
    sleep 0.3
  done
  curl -fsS -m 2 "http://$bind:$MODEL_PORT/api/version" >/dev/null ||
    blocked "ollama serve did not answer on $bind:$MODEL_PORT; see $evidence/ollama.log"
  if ! OLLAMA_HOST="$bind:$MODEL_PORT" ollama list | awk 'NR>1{print $1}' | grep -qx "$OLLAMA_MODEL"; then
    [ "$pull" = yes ] || blocked "model $OLLAMA_MODEL is not downloaded; rerun with --pull to download it"
    OLLAMA_HOST="$bind:$MODEL_PORT" ollama pull "$OLLAMA_MODEL" ||
      blocked "could not download model $OLLAMA_MODEL"
  fi
  OLLAMA_BASE_URL="http://host.docker.internal:$MODEL_PORT"
}

up() {
  local mode=controlled pull=no replies="$here/replies.json"
  while [ $# -gt 0 ]; do
    case "$1" in
      --model) mode="$2" && shift 2 ;;
      --replies) replies="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")" && shift 2 ;;
      --pull) pull=yes && shift ;;
      *) die "unknown option $1" ;;
    esac
  done
  case "$mode" in controlled | live) ;; *) die "--model takes controlled or live" ;; esac
  [ -f "$state" ] && die "this worktree already has a stand ($PROJECT); run: $0 doctor, or $0 down"
  command -v node >/dev/null || blocked "node is not on PATH"
  docker info >/dev/null 2>&1 || blocked "the Docker daemon is not reachable"
  [ -z "$(compose ps -aq 2>/dev/null)" ] || die "Compose project $PROJECT has leftover containers; run: $0 down"
  [ -f "$replies" ] || die "no replies file at $replies"
  [ -z "$(git -C "$root" status --porcelain --untracked-files=no)" ] ||
    die "tracked files have uncommitted changes; commit first, because the report names the commit it checked"

  if [ -n "$(ls -A "$evidence" 2>/dev/null)" ]; then
    mkdir -p "$root/.scratch/previous-evidence"
    mv "$evidence" "$root/.scratch/previous-evidence/$(date -u +%Y%m%dT%H%M%SZ)"
    say "Moved the previous run's evidence to .scratch/previous-evidence/"
  fi
  mkdir -p "$scratch" "$evidence"
  : >"$state"
  # shellcheck disable=SC2154
  trap 'code=$?; [ $code -eq 0 ] || { trap - EXIT; teardown || true; exit $code; }' EXIT
  remember PROJECT "$PROJECT"
  remember MODEL_MODE "$mode"
  MODEL_MODE="$mode"

  if [ "$mode" = controlled ]; then start_controlled_model; else start_live_model; fi
  remember OLLAMA_BASE_URL "$OLLAMA_BASE_URL"
  remember OLLAMA_MODEL "$OLLAMA_MODEL"
  export OLLAMA_BASE_URL OLLAMA_MODEL

  export HTTP_PORT PUBLIC_ORIGIN
  HTTP_PORT="$(free_port)" PUBLIC_ORIGIN="http://localhost:$HTTP_PORT"
  say "Building $PROJECT-app from $(git -C "$root" rev-parse --short HEAD)"
  if command -v agent-heavy >/dev/null; then
    agent-heavy -- docker compose -p "$PROJECT" --project-directory "$root" -f "$root/compose.yaml" build api >"$scratch/build.log" 2>&1 ||
      die "the image did not build; see the end of the log: $(tail -n 20 "$scratch/build.log")"
  else
    compose build api >"$scratch/build.log" 2>&1 ||
      die "the image did not build; see the end of the log: $(tail -n 20 "$scratch/build.log")"
  fi
  local started=no
  for _ in 1 2 3; do
    if compose up -d >"$scratch/up.log" 2>&1; then
      started=yes
      break
    fi
    grep -qiE 'port is already allocated|address already in use' "$scratch/up.log" || break
    HTTP_PORT="$(free_port)" PUBLIC_ORIGIN="http://localhost:$HTTP_PORT"
  done
  [ "$started" = yes ] || die "the stand did not start: $(tail -n 20 "$scratch/up.log")"
  remember HTTP_PORT "$HTTP_PORT"
  remember PUBLIC_ORIGIN "$PUBLIC_ORIGIN"
  remember BUILT_COMMIT "$(git -C "$root" rev-parse HEAD)"

  for _ in $(seq 1 120); do
    [ "$(curl -s -o /dev/null -m 2 -w '%{http_code}' "$PUBLIC_ORIGIN/" || true)" = 200 ] && break
    sleep 1
  done
  doctor || die "the stand started but is not usable"
  say "Ready: $PUBLIC_ORIGIN  (Compose project $PROJECT, model $MODEL_MODE)"
}

doctor() {
  load
  local failed=0
  check() {
    local name="$1"
    shift
    if "$@" >/dev/null 2>&1; then say "ok    $name"; else
      say "FAIL  $name"
      failed=1
    fi
  }
  services_running() {
    local running
    running="$(compose ps --status running --services)"
    for service in postgres api worker; do
      printf '%s\n' "$running" | grep -qx "$service" || return 1
    done
  }
  port_is_ours() { [ "$(compose port api 3000)" = "127.0.0.1:$HTTP_PORT" ]; }
  page_served() { [ "$(curl -s -o /dev/null -m 5 -w '%{http_code}' "$PUBLIC_ORIGIN/")" = 200 ]; }
  origin_matches() { [ "$(compose exec -T api printenv PUBLIC_ORIGIN)" = "$PUBLIC_ORIGIN" ]; }
  worker_ready() {
    for _ in $(seq 1 30); do
      compose logs worker 2>/dev/null | grep -q 'Worker ready' && return 0
      sleep 1
    done
    return 1
  }
  build_is_head() { [ "$BUILT_COMMIT" = "$(git -C "$root" rev-parse HEAD)" ]; }
  tree_is_committed() { [ -z "$(git -C "$root" status --porcelain --untracked-files=no)" ]; }

  check "postgres, api and worker are running in $PROJECT" services_running
  check "port $HTTP_PORT is published by this project's api" port_is_ours
  check "$PUBLIC_ORIGIN/ answers 200 (migrations applied, client served)" page_served
  check "api was started with PUBLIC_ORIGIN=$PUBLIC_ORIGIN" origin_matches
  check "worker logged 'Worker ready'" worker_ready
  check "image was built from the current HEAD ($(git -C "$root" rev-parse --short HEAD))" build_is_head
  check "tracked files have no uncommitted changes" tree_is_committed
  check "$MODEL_MODE model process $MODEL_PID is the one this run started" model_alive
  check "api container reaches the model at $OLLAMA_BASE_URL" model_reachable_from_api
  return $failed
}

capture() {
  [ $# -eq 1 ] || die "usage: $0 capture <label>"
  load
  local out="$evidence/$1-state.txt"
  {
    say "# Stored state of $PROJECT at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    say "model calls so far: $(model_calls)"
    compose exec -T postgres psql -U postgres -d sensei -x \
      -c "SELECT (SELECT count(*) FROM workspaces) AS workspaces, (SELECT count(*) FROM guest_sessions) AS guest_sessions, (SELECT count(*) FROM goal_setup_turns) AS goal_setup_turns" \
      -c "SELECT workspace_id, revision, turn_id, last_proposal_version, result->>'message' AS message, result->>'reply' AS reply, result->'draft'->'details' AS details, result->'draft'->'current' AS current, result->'path' AS path FROM goal_setup_turns ORDER BY workspace_id, revision"
  } >"$out"
  say "$out"
}

command="${1:-}"
[ $# -gt 0 ] && shift
case "$command" in
  up) up "$@" ;;
  doctor) doctor ;;
  env) load && cat "$state" ;;
  capture) capture "$@" ;;
  down) teardown ;;
  *) die "usage: $0 up [--model controlled|live] [--replies <file>] [--pull] | doctor | env | capture <label> | down" ;;
esac
