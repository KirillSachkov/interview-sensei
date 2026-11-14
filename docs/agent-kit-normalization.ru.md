# Нормализация Agent Kit, issue #119

База и review base: `6c8e3a795e3424a5d26f44d0fb52ac867a4f0305`. Ветка: `Sachkov/skills-normalization`.
Источник всех 28 выбранных процедур: `b1608ac14d8f934a8686a0c583f1110466a18b18` публичного Agent Kit.
[Состав и перенос политики](../.agents/skills/AGENT-KIT.md), [issue](https://github.com/KirillSachkov/interview-sensei/issues/119).

## Идентичность сохранённых материалов

Git tree ID включает имена, bytes и режимы файлов. До установки проверен чистый status. После установки `git diff --exit-code` по каждой невыбранной папке подтвердил неизменность tracked bytes/modes; На чистом preflight package links отсутствовали; frozen install создал три ссылки из прежнего pnpm lockfile. Их targets внутри node_modules дополнительно проверены. Единственное намеренное изменение невыбранного router: ask-matt сокращён до alias к ask; его режим явного запуска и native metadata сохранены.

| Папка | До | После |
| --- | --- | --- |
| `skills` | `4ec734d019ae9e9d3cac9899371b6c08aebba3df` | `4ec734d019ae9e9d3cac9899371b6c08aebba3df` |
| `skills/sensei-answers` | `36773a8787a3ee4215a9dfa8c3c5bacacc622743` | `36773a8787a3ee4215a9dfa8c3c5bacacc622743` |
| `skills/sensei-check` | `afcbbe0c82abf66e49363846c270c55c68b55564` | `afcbbe0c82abf66e49363846c270c55c68b55564` |
| `skills/sensei-explain` | `a213fa1fafc57f447e144e5dc6eb3be3fa3ab6f5` | `a213fa1fafc57f447e144e5dc6eb3be3fa3ab6f5` |
| `skills/sensei-inbox` | `c63945e141187256a3eef0792f71b343dc827bd9` | `c63945e141187256a3eef0792f71b343dc827bd9` |
| `skills/sensei-interview` | `60300e84651cb44d6926fe884f60a40a8657b7b3` | `60300e84651cb44d6926fe884f60a40a8657b7b3` |
| `skills/sensei-setup` | `8ebe01eb49115c49aab2f9141f3ec14097851383` | `8ebe01eb49115c49aab2f9141f3ec14097851383` |

Приложение, canon, провайдеры, данные, package-owned материалы и корневой AGENTS.md не входят в diff. Все исходные bytes скиллов сохранены отдельно в частной временной резервной копии; installer backups вынесены туда же, чтобы локальный link checker не обходил их как живые документы. Репозиторий игнорирует будущие `.agents/skills-backups/`. Checker не менялся.

## Проверка источника и discovery

Канонический `tools/skills.py check` подтвердил все выбранные папки и lock. Установщик сравнил три unmanaged папки с их точными tracked bytes/modes исходной базы до adoption; force не использовался. Итоговый manifest содержит только provider agent-kit и публичный immutable ref, временных путей в нём и lock нет.
`scripts/check.py` проверяет полные directory hashes, metadata, links/anchors и `.claude/skills`. Codex читает `.agents/skills`, Claude получает те же папки через alias. Это статическая проверка discovery, без запуска настоящих клиентов или подписок.

## Проверки и ревью

Команды и фактические результаты полного pnpm verify, git diff --check, независимого Standards/Spec review и текущего CI будут приложены к PR с точными endpoints. Проверки используют pinned pnpm/Node, fake ACP, временные данные и порт 14327 этого worktree. Live transcription и реальные агенты не запускались.
Владелец перед merge проверяет сохранность полномочий по таблице переноса и явно одобряет полный SHA. Начало implement не является таким разрешением.
