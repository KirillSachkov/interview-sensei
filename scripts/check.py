#!/usr/bin/env python3
"""Check repository structure. This does not evaluate agent behavior or translation meaning."""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


def prose(text: str) -> str:
    """Exclude fenced examples, including triple fences inside four-backtick examples."""
    result, fence = [], None
    for line in text.splitlines():
        match = re.match(r"^\s*(`{3,}|~{3,})(.*)$", line)
        if fence:
            if match and match[1][0] == fence[0] and len(match[1]) >= fence[1] and not match[2].strip():
                fence = None
            continue
        if match:
            fence = (match[1][0], len(match[1]))
        else:
            result.append(line)
    return "\n".join(result)


def anchors(text: str) -> set[str]:
    result, seen = set(), {}
    for heading in re.findall(r"^#{1,6}\s+(.+?)\s*#*$", prose(text), re.M):
        slug = re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")
        suffix = seen.get(slug, 0)
        seen[slug] = suffix + 1
        result.add(slug + (f"-{suffix}" if suffix else ""))
    return result


# Generated and installed trees: package READMEs and test reports are not repository documents.
SKIPPED = {".git", "node_modules", "dist", "test-results", "playwright-report"}


def repository_files(root: Path, pattern: str) -> list[Path]:
    return sorted(file for file in root.rglob(pattern) if not SKIPPED & set(file.relative_to(root).parts))


def identity(directory: Path) -> str:
    digest = hashlib.sha256()
    for file in sorted(directory.rglob("*"), key=lambda file: file.relative_to(directory).as_posix()):
        if file.is_file():
            digest.update(file.relative_to(directory).as_posix().encode() + b"\0" + file.read_bytes() + b"\0")
    return digest.hexdigest()


def frontmatter(file: Path) -> str | None:
    match = re.match(r"^---\n(.*?)\n---", file.read_text(), re.S)
    return match[1] if match else None


def skill_name(text: str) -> str | None:
    name = re.search(r"^name:\s*([^\n]+)", text, re.M)
    return name[1].strip(" '\"") if name else None


def check_skill_frontmatter(label: str, file: Path, expected: str, mismatch: str, errors: list[str]) -> str | None:
    """Shared by own and package skills: frontmatter, a name equal to its directory and a description."""
    text = frontmatter(file)
    if text is None:
        errors.append(f"{label}: missing frontmatter")
        return None
    if skill_name(text) != expected:
        errors.append(f"{label}: {mismatch}")
    if not re.search(r"^description:\s*\S", text, re.M):
        errors.append(f"{label}: missing description")
    return text


def check_package_skill(root: Path, directory: Path, errors: list[str]) -> bool:
    """A dependency's skill that pnpm links at install time; the lockfile pins its content."""
    target = directory.resolve()
    if not directory.name.startswith("pnpm-") or not target.is_relative_to(root / "node_modules"):
        errors.append(f"{directory.name}: a skill link must be a pnpm- link into {root / 'node_modules'}")
        return False
    file = target / "SKILL.md"
    if not file.is_file():
        errors.append(f"{directory.name}: package skill link has no SKILL.md at {target}")
    else:
        mismatch = f"name differs from the package skill directory {target.name}"
        check_skill_frontmatter(directory.name, file, target.name, mismatch, errors)
    return True


def check(root: Path) -> tuple[list[str], dict[str, int]]:
    root = root.resolve()
    errors, counts = [], {"skills": 0, "package_skills": 0, "local_links": 0}
    skills = root / ".agents/skills"
    inventory = (skills / "README.md").read_text()
    for directory in sorted(skills.iterdir()):
        if directory.is_symlink():
            # pnpm links approved dependency skills into node_modules; own skills are real directories.
            counts["package_skills"] += check_package_skill(root, directory, errors)
            continue
        file = directory / "SKILL.md"
        if not file.is_file():
            continue
        counts["skills"] += 1
        frontmatter_text = check_skill_frontmatter(directory.name, file, directory.name, "name mismatch", errors)
        if frontmatter_text is None:
            continue
        native = directory / "agents/openai.yaml"
        if not native.is_file():
            errors.append(f"{directory.name}: missing native metadata")
        else:
            implicit = re.search(r"allow_implicit_invocation:\s*(true|false)", native.read_text())
            user_only = bool(re.search(r"^disable-model-invocation:\s*true\s*$", frontmatter_text, re.M))
            if (implicit is None or implicit[1] == "true") == user_only:
                errors.append(f"{directory.name}: invocation policies disagree")
        row = f"| `{directory.name}` | `{identity(directory)}` |"
        if row not in inventory:
            errors.append(f"{directory.name}: directory identity differs from inventory")

    for file in repository_files(root, "*.md"):
        for raw in re.findall(r"(?<!!)\[[^\]\n]*\]\(([^)\n]+)\)", prose(file.read_text())):
            url = urlsplit(raw.strip().split(' "')[0].strip("<>"))
            if url.scheme or url.netloc:
                continue
            counts["local_links"] += 1
            path = unquote(url.path)
            target = (root / path.lstrip("/")) if path.startswith("/") else (file.parent / path)
            target = target.resolve() if path else file
            if not target.is_relative_to(root) or not target.exists():
                errors.append(f"{file.relative_to(root)}: missing local link {raw}")
            elif url.fragment and target.suffix == ".md" and unquote(url.fragment) not in anchors(target.read_text()):
                errors.append(f"{file.relative_to(root)}: missing anchor {raw}")

    for file in repository_files(root, "CLAUDE.md"):
        errors.append(f"{file.relative_to(root)}: use native AGENTS.md instead of CLAUDE.md")
    for left, right in [(".claude/skills", ".agents/skills")]:
        if not (root / left).is_symlink() or (root / left).resolve() != (root / right).resolve():
            errors.append(f"{left}: incorrect client pointer")
    if not re.search(r"^Human language: ru\.$", (root / "AGENTS.md").read_text(), re.M):
        errors.append("AGENTS.md: the human language must be ru")
    return errors, counts


if __name__ == "__main__":
    problems, checked = check(Path(__file__).resolve().parents[1])
    print(
        f"Checked {checked['skills']} own skills, {checked['package_skills']} package skills"
        f" and {checked['local_links']} local links/anchors."
    )
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        raise SystemExit(1)
    print("Structure checks passed. Behavior and text meaning require separate evidence.")
