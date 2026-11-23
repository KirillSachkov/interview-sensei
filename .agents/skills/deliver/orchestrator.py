#!/usr/bin/env python3
"""Lead tickets through a project's pipeline, one run at a time.

Experimental. The orchestrator reads a ticket's stage, starts one run of the task that
stage calls for (a fresh headless session of the client), runs the task's check and
moves the ticket to the next stage. The tasks live in the project's
docs/agents/pipeline.toml; this program only walks them, on this machine as the runner.

State is the ticket's stage (a line in a ticket file, else state.json) and one folder per
ticket under .factory/: state.json, the journal of runs and each run's log. An
orchestrator that dies or is stopped loses nothing: the next one starts from the
recorded stage.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
import time
try:
    import tomllib
except ImportError:
    sys.exit("factory: this program needs Python 3.11 or newer")

STAGE = re.compile(r"^\*\*Stage:\*\* *(\S+) *$", re.M)
SESSION = re.compile(r'"(?:session_id|thread_id|sessionID)"\s*:\s*"([^"]+)"')
BLOCKED = "blocked"
# How to start one run in a client, and the sign that invokes a skill in it.
# A pipeline adds or replaces clients in its [agents.<name>] tables.
CLIENTS = {
    "claude": {"command": "claude -p {prompt} --model {model} --output-format stream-json --verbose "
                          "--dangerously-skip-permissions", "skill": "/"},
    # A delivery pushes to a remote and calls the host CLI, both outside the checkout.
    "codex": {"command": "codex exec --sandbox danger-full-access -m {model} --json {prompt}", "skill": "$"},
}


class FactoryError(Exception):
    pass


class Stopped(BaseException):
    """The owner stopped the run."""


def load_pipeline(project):
    path = project / "docs/agents/pipeline.toml"
    if not path.is_file():
        raise FactoryError(f"No pipeline at {path}")
    data = tomllib.loads(path.read_text())
    tasks = data.get("task", [])
    for task in tasks:
        missing = [key for key in ("name", "when", "run", "check", "then") if not task.get(key)]
        if missing:
            raise FactoryError(f"Task {task.get('name', '?')} lacks: {', '.join(missing)}")
    if len({task["name"] for task in tasks}) != len(tasks) or len({task["when"] for task in tasks}) != len(tasks):
        raise FactoryError("Task names and their starting stages must be unique")
    return data, tasks


def git(folder, *args):
    return subprocess.run(["git", "-C", str(folder), *args], capture_output=True, text=True)


class Ticket:
    """A ticket or spec file of the local tracker, or a reference the host tracker understands."""

    def __init__(self, project, ref, spec=False):
        path = project / ref
        self.project = project
        self.file = path if path.is_file() else None
        self.ref = str(path.relative_to(project)) if self.file else ref
        if not self.file:
            self.name = re.sub(r"[^A-Za-z0-9._-]+", "-", ref).strip("-")
        elif path.name == "spec.md":  # a spec is named by its feature folder
            self.name = path.parent.name
        elif path.parent.name == "issues":  # ticket numbers restart in every feature
            self.name = f"{path.parent.parent.name}-{path.stem}"
        else:
            self.name = path.stem
        if not self.name:
            raise FactoryError(f"Cannot name the ticket: {ref}")
        self.folder = project / ".factory" / self.name
        known = self.state().get("ref", self.ref)
        if known != self.ref:
            raise FactoryError(f"{self.ref} and {known} share the name {self.name}; rename one of them")
        self.spec = spec or bool(self.file and path.name == "spec.md") or bool(self.state().get("spec"))

    def state(self):
        path = self.folder / "state.json"
        return json.loads(path.read_text()) if path.is_file() else {}

    def update(self, **changes):
        """Only the process that leads the ticket writes its state; a whole file replaces the old one."""
        state = self.state() | {"ref": self.ref} | changes
        self.folder.mkdir(parents=True, exist_ok=True)
        ignore = self.project / ".factory/.gitignore"
        if not ignore.exists():
            ignore.write_text("*\n")
        fresh = self.folder / "state.json.new"
        fresh.write_text(json.dumps(state, indent=2) + "\n")
        os.replace(fresh, self.folder / "state.json")
        return state

    def lock(self):
        """Hold the ticket for this process. The lock dies with the process, so it never goes stale."""
        self.folder.mkdir(parents=True, exist_ok=True)
        held = (self.folder / "lock").open("w")
        try:
            fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            held.close()
            return None
        return held

    def running(self):
        held = self.lock()
        if held:
            held.close()
        return held is None

    def stage(self):
        if self.file:
            found = STAGE.search(self.file.read_text())
            return found[1] if found else None
        return self.state().get("stage")

    def set_stage(self, value, note=None):
        if not self.file:
            self.update(stage=value, note=note)
            return
        text = self.file.read_text()
        line = f"**Stage:** {value}"
        text = STAGE.sub(line, text, count=1) if STAGE.search(text) else text.rstrip("\n") + f"\n\n{line}\n"
        if note:
            text = text.rstrip("\n") + f"\n\n> {note}\n"
        self.file.write_text(text)

    def journal(self, **record):
        self.folder.mkdir(parents=True, exist_ok=True)
        with (self.folder / "runs.jsonl").open("a") as out:
            out.write(json.dumps(dict(ticket=self.name) | record) + "\n")


def agent_argv(pipeline, agent, model, prompt):
    custom = os.environ.get("FACTORY_AGENT")
    if custom:  # tests and other launchers: the prompt arrives as the last argument
        return [*shlex.split(custom), prompt]
    client = CLIENTS.get(agent, {}) | pipeline.get("agents", {}).get(agent, {})
    if not client.get("command"):
        raise FactoryError(f"Unknown agent: {agent}. Add [agents.{agent}] with a command to the pipeline")
    if prompt.startswith("/"):
        prompt = client.get("skill", "/") + prompt[1:]  # the same skill command in this client's spelling
    return [prompt if part == "{prompt}" else part.replace("{model}", model) for part in shlex.split(client["command"])]


def place(pipeline, ticket):
    """The folder the ticket's runs work in: the checkout the owner chose by leaving the base
    branch, else a worktree of the ticket's own, created once."""
    state = ticket.state()
    project = ticket.project
    if state.get("worktree") and Path(state["worktree"]).is_dir():
        work = Path(state["worktree"])
        if not state.get("ready"):
            prepare(pipeline, ticket, work)
        return work
    current = git(project, "branch", "--show-current").stdout.strip()
    if current != pipeline.get("base", "main"):
        ticket.update(worktree=str(project), branch=current, spec=ticket.spec, ready=True)
        return project
    root = Path(os.path.expanduser(pipeline.get("worktrees", "../{project}-worktrees").format(project=project.name)))
    work = (project / root).resolve() / ticket.name
    branch = pipeline.get("branch", "deliver/{name}").format(name=ticket.name)
    exists = git(project, "rev-parse", "--verify", "--quiet", "refs/heads/" + branch).returncode == 0
    added = git(project, "worktree", "add", str(work), branch) if exists else git(project, "worktree", "add", "-b", branch, str(work))
    if added.returncode:
        raise FactoryError(f"Cannot create the worktree {work}: {added.stderr.strip()}")
    ticket.update(worktree=str(work), branch=branch, spec=ticket.spec, ready=False)
    prepare(pipeline, ticket, work)
    return work


def prepare(pipeline, ticket, work):
    """Run the pipeline's setup in a new worktree; a failed setup runs again next time."""
    if pipeline.get("setup"):
        # The pipeline's setup and checks are shell lines the owner wrote, so they run through the shell.
        done = subprocess.run(pipeline["setup"], shell=True, cwd=work, capture_output=True, text=True)
        if done.returncode:
            raise FactoryError(f"The worktree setup failed: {(done.stdout + done.stderr).strip()[-300:]}")
    ticket.update(ready=True)


def start_run(argv, work, env, log, timeout):
    """Start one run in its own process group and wait for it, so a stop ends everything it started."""
    with log.open("w") as out, log.with_suffix(".stderr").open("w") as err:
        # Some clients take their folder from PWD rather than from the process.
        child = subprocess.Popen(argv, cwd=work, env=env | {"PWD": str(work)}, stdin=subprocess.DEVNULL, stdout=out,
                                 stderr=err, start_new_session=True)
        try:
            return child.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            return 124
        finally:  # a timeout, a stop or a crash here: nothing the run started outlives it
            for sign in (signal.SIGTERM, signal.SIGKILL):
                if child.poll() is not None:
                    break
                try:
                    os.killpg(child.pid, sign)
                    child.wait(timeout=10)
                except (ProcessLookupError, subprocess.TimeoutExpired):
                    pass


def run_task(pipeline, tasks, ticket, timeout):
    """Run the task the ticket's stage calls for. Return the new stage, or None when no task applies."""
    task = next((item for item in tasks if item["when"] == ticket.stage()), None)
    if task is None:
        return None
    work = place(pipeline, ticket)
    branch = ticket.state().get("branch")
    current = git(work, "branch", "--show-current").stdout.strip()
    if branch and current != branch:
        if work == ticket.project:
            raise FactoryError(f"{ticket.name} works on {branch}, but this checkout is on {current}")
        switched = git(work, "switch", branch)
        if switched.returncode:
            raise FactoryError(f"Cannot switch to {branch}: {switched.stderr.strip()}")
    # A run reads the ticket where it works; a ticket file git does not carry stays in the project.
    ref = ticket.ref if not ticket.file or (work / ticket.ref).is_file() else str(ticket.file)
    env = os.environ | {"FACTORY_TICKET": ref, "FACTORY_TICKET_NAME": ticket.name, "FACTORY_TASK": task["name"]}
    agent = task.get("agent", pipeline.get("agent", "claude"))
    model = task.get("model", pipeline.get("model", "sonnet"))
    instruction = task.get("run_spec", task["run"]) if ticket.spec else task["run"]
    argv = agent_argv(pipeline, agent, model, instruction.format(ticket=ref, name=ticket.name))
    reason = "the task's check did not pass"
    for attempt in range(1, int(task.get("attempts", 1)) + 1):
        number = len(list(ticket.folder.glob(f"{task['name']}-*.jsonl"))) + 1  # every run keeps its own log
        log = ticket.folder / f"{task['name']}-{number}.jsonl"
        ticket.update(running=dict(task=task["name"], attempt=attempt, started=int(time.time()), log=log.name))
        started = time.monotonic()
        try:
            code = start_run(argv, work, env, log, int(task.get("timeout", timeout)))
        except Stopped:
            ticket.journal(task=task["name"], attempt=attempt, stopped=True, session=session_id(log), log=log.name)
            raise
        finally:
            ticket.update(running=None)
        check = subprocess.run(task["check"], shell=True, cwd=work, env=env, capture_output=True, text=True)
        ticket.journal(task=task["name"], attempt=attempt, agent=agent, model=model, agent_exit=code,
                     check_exit=check.returncode, seconds=round(time.monotonic() - started, 1),
                     session=session_id(log), log=log.name)
        # The skill may have moved the work to a branch of its own; later tasks and attempts follow it.
        ticket.update(branch=git(work, "branch", "--show-current").stdout.strip() or branch)
        if check.returncode == 0:
            ticket.update(blocked_at=None)
            ticket.set_stage(task["then"])
            return task["then"]
        reason = ((check.stdout + check.stderr).strip().splitlines() or [reason])[-1]
        if check.returncode == 3:  # the check says a retry cannot help
            break
    ticket.update(blocked_at=task["when"])
    ticket.set_stage(BLOCKED, f"Blocked at {task['name']}: {reason}")
    return BLOCKED


def session_id(log):
    found = SESSION.search(log.read_text(errors="replace")) if log.is_file() else None
    return found[1] if found else None


def lead(pipeline, tasks, ticket, timeout, prepare_stage=None):
    """Advance one ticket until it reaches a stage no task starts from. Return whether it moved."""
    held = ticket.lock()
    if held is None:
        raise FactoryError(f"{ticket.name} is already running")
    moved = False
    try:
        ticket.update(pid=os.getpid())
        if prepare_stage:
            prepare_stage()
        while True:
            result = run_task(pipeline, tasks, ticket, timeout)
            if result is None:
                return moved
            print(f"{ticket.ref}: {result}", flush=True)
            moved = True
    finally:
        ticket.update(pid=None)
        held.close()


def tickets_in(project, pattern):
    found = set(project.glob(pattern)) | set(project.glob(".scratch/*/issues/*.md"))
    files = {path for path in found if path.is_file() and STAGE.search(path.read_text())}
    tickets = {ticket.name: ticket for ticket in (Ticket(project, str(path.relative_to(project))) for path in sorted(files))}
    for state in sorted(project.glob(".factory/*/state.json")):  # tickets of a host tracker have no file
        saved = json.loads(state.read_text())
        if state.parent.name not in tickets and "stage" in saved:
            tickets[state.parent.name] = Ticket(project, saved.get("ref", state.parent.name))
    return list(tickets.values())


def status_line(ticket):
    state = ticket.state()
    running = state.get("running") if ticket.running() else None
    journal = ticket.folder / "runs.jsonl"
    last = json.loads(journal.read_text().splitlines()[-1]) if journal.is_file() and journal.read_text().strip() else {}
    parts = [ticket.name, ticket.stage() or "-"]
    if running:
        minutes = (int(time.time()) - running["started"]) // 60
        parts.append(f"running {running['task']} attempt {running['attempt']} for {minutes} min")
        current = session_id(ticket.folder / running.get("log", ""))
        if current:
            parts.append(f"session {current}")
    else:
        parts.append("not running")
    if last and not running:
        result = "stopped" if last.get("stopped") else ("passed" if last.get("check_exit") == 0 else "failed")
        parts.append(f"last: {last['task']} attempt {last['attempt']} {result}")
        if last.get("session"):
            parts.append(f"session {last['session']}")
    if state.get("worktree"):
        parts.append(f"in {state['worktree']} on {state.get('branch')}")
    return "\t".join(parts)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0], allow_abbrev=False)
    parser.add_argument("command", choices=("run", "status", "stop", "wait"))
    parser.add_argument("ticket", nargs="?", help="ticket or spec file relative to the project, or a tracker reference; "
                                                "run and status take every staged ticket without it")
    parser.add_argument("--project", type=Path, default=Path.cwd())
    parser.add_argument("--tickets", default=".scratch/*/*.md", help="glob of local ticket files that may carry a stage")
    parser.add_argument("--stage", help="run: start the named ticket from this stage, such as rework")
    parser.add_argument("--spec", action="store_true", help="run: the tracker reference is a spec with tickets")
    parser.add_argument("--detach", action="store_true", help="run: return at once and leave the run in the background")
    parser.add_argument("--timeout", type=int, default=1800, help="seconds for one run")
    args = parser.parse_args(argv)
    try:
        project = args.project.resolve()
        pipeline, tasks = load_pipeline(project)
        ticket = Ticket(project, args.ticket, args.spec) if args.ticket else None
        if args.command not in ("run", "status") and ticket is None:
            raise FactoryError(f"{args.command} needs a ticket")
        if args.command == "status":
            for item in [ticket] if ticket else tickets_in(project, args.tickets):
                print(status_line(item))
            return 0
        if args.command == "stop":
            if not ticket.running():
                print(f"{ticket.name} is not running")
                return 0
            pid = ticket.state().get("pid")
            if pid:  # the lock is held, so this pid is the run
                os.kill(pid, signal.SIGTERM)
            for _ in range(150):
                if not ticket.running():
                    break
                time.sleep(0.2)
            print(f"Stopped {ticket.name}; run it again to continue from {ticket.stage()}")
            return 0
        if args.command == "wait":
            while ticket.running():
                time.sleep(2)
            print(status_line(ticket))
            return 0
        if args.detach:
            if ticket and ticket.running():
                raise FactoryError(f"{ticket.name} is already running")
            again = [sys.executable, str(Path(__file__).resolve()), *[arg for arg in (argv or sys.argv[1:]) if arg != "--detach"]]
            folder = ticket.folder if ticket else project / ".factory"
            folder.mkdir(parents=True, exist_ok=True)
            with (folder / "run.log").open("a") as out:
                child = subprocess.Popen(again, cwd=Path.cwd(), stdin=subprocess.DEVNULL, stdout=out, stderr=out,
                                         start_new_session=True)
            while ticket and child.poll() is None and not ticket.running():
                time.sleep(0.05)  # return once the run holds the ticket, so a wait that follows sees it
            if child.poll() not in (None, 0):
                raise FactoryError(f"The run did not start; see {folder / 'run.log'}")
            print(f"Started in the background (pid {child.pid}); follow it with status")
            return 0

        def stop(*_):
            raise Stopped()
        for sign in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            signal.signal(sign, stop)
        if ticket:
            def first_stage():
                current = ticket.stage()
                if args.stage:
                    ticket.set_stage(args.stage)
                elif current == BLOCKED and ticket.state().get("blocked_at"):
                    ticket.set_stage(ticket.state()["blocked_at"])  # the owner dealt with the block; take the task again
                elif current is None and tasks:
                    ticket.set_stage(tasks[0]["when"])
            lead(pipeline, tasks, ticket, args.timeout, first_stage)
            return 0
        while any([lead(pipeline, tasks, item, args.timeout) for item in tickets_in(project, args.tickets)]):
            pass
        return 0
    except Stopped:
        print("factory: stopped", file=sys.stderr)
        return 130
    except FactoryError as error:
        print(f"factory: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
