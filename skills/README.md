# Skills агентов приложения

Здесь лежат skills, которые приложение передаёт агенту кандидата в сессиях. У каждого вида сессии ровно один skill; его имя задаёт профиль вида в `packages/core/src/shared/session-kinds/profiles.ts`.

| Skill | Вид сессии |
| --- | --- |
| [`sensei-check`](sensei-check/SKILL.md) | `service-chat`, в UI — «Проверка агента» |
| [`sensei-interview`](sensei-interview/SKILL.md) | `mock-interview`, в UI — мок-собеседование в зоне «Сессии» |

`pnpm build` копирует этот каталог в `apps/web/dist/skills`, рядом с веб-сборкой; оттуда их берёт команда `interview-sensei`. Тот же каталог входит в npm-пакет `interview-sensei`.

Перед каждым запуском сервер копирует skill вида в каталог данных в формат агента: plugin для Claude Code, `.agents/skills` для Codex, каталог skills для OpenCode. Копия совпадает с исходником: удалённые файлы skill исчезают и из неё. Тексты skills — на английском.

Это не skills разработки репозитория: они лежат в `.agents/skills`.
