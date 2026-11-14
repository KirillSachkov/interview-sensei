# Выбранные скиллы Agent Kit

Источник: [KirillSachkov/agent-kit](https://github.com/KirillSachkov/agent-kit/tree/b1608ac14d8f934a8686a0c583f1110466a18b18), commit `b1608ac14d8f934a8686a0c583f1110466a18b18`.
[Manifest](../skills-manifest.json) выбирает 28 папок, [lock](../skills-lock.json) закрепляет полные папки, режимы файлов и уведомления лицензий.

Состав: `code-review`, `codebase-design`, `diagnosing-bugs`, `grill-me`, `grill-with-docs`, `grilling`, `handoff`, `implement`, `improve-codebase-architecture`, `prototype`, `research`, `retro`, `setup-matt-pocock-skills`, `ship`, `tdd`, `teach`, `to-questionnaire`, `to-spec`, `to-tickets`, `triage`, `wait-what`, `wayfinder`, `wizard`, `writing-for-agents`, `domain-modeling`, `implement-spec`, `pr`, `ask`.

## Перенос политики

База миграции: `6c8e3a795e3424a5d26f44d0fb52ac867a4f0305`. Issue: [#119](https://github.com/KirillSachkov/interview-sensei/issues/119).
Все 28 прежних общих процедур сверены с выбранным источником. Предыдущие 24 managed selection обновлены штатно. Три tracked-варианта `domain-modeling`, `implement-spec`, `pr` приняты установщиком по точным bytes/modes исходного commit через временный частный каталог, затем обновлены каноническим каталогом. Частный каталог и резервные копии не входят в репозиторий.
`ask` установлен целиком; `ask-matt` оставлен маленьким совместимым alias с прежним явным запуском.

| Прежнее правило | Владелец после переноса |
| --- | --- |
| Явный выбор implement или implement-spec | Корневой AGENTS.md, без изменений |
| Commit перед review, commit исправлений перед повторным review | docs/agents/delivery.md |
| Свежий исправитель интеграции и ticket, свежий merger, обновление worker от integration tip | docs/agents/delivery.md |
| Подтверждение seams до тестов | docs/agents/testing.md |
| Подтверждение spec до публикации | docs/agents/requirements.md |
| Отдельный diagnosis worktree и сохранение prototype evidence | docs/agents/worktrees.md |
| DOMAIN.md, DOMAIN-MAP.md, docs/adr и нумерация ADR | docs/agents/domain.md |
| Пять частей PR, первая строка с действием владельца | docs/agents/human-review.md, без изменений |
| Актуальный CI и разрешение merge точного SHA | docs/agents/delivery.md, без изменений |

Нативная metadata implement и implement-spec теперь разрешает обнаружение моделью, как в Agent Kit. Оно не разрешает начинать реализацию без явного выбора владельца. Проверка scripts/check.py продолжает проверять согласованность metadata и hashes; её код не изменён.

## Сохранённые материалы

Шесть продуктовых skills/sensei-* и их исходное дерево `4ec734d019ae9e9d3cac9899371b6c08aebba3df` сохранены. Приложение, данные, провайдеры и их конфигурация не менялись. `pnpm install --frozen-lockfile` создал три package-owned symlinks из прежнего lockfile; `.claude/skills` указывает на `.agents/skills`. Новые общие скиллы сверх существующего состава не устанавливались: ask заменяет прежний router.

## Обновление

Используйте [канонический установщик](https://github.com/KirillSachkov/agent-kit/blob/b1608ac14d8f934a8686a0c583f1110466a18b18/tools/skills.py) из явно выбранного checkout библиотеки: select с полным SHA и нужными именами, preview, install, check. Не меняйте locked папки вручную. Обновляйте таблицу hashes в README после установки полных папок с notices. Установленные копии и runtime aliases работают без Home и соседнего clone; только обновление требует источник.
