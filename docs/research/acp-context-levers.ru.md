# Рычаги контекста агентов через ACP

Документ отвечает на issue #2: что наш ACP-клиент может задать агенту при запуске. Дата проверки: 2026-11-08.
Проверены `claude-agent-acp` 0.101.0 (коммит `3b22586`), `codex-acp` 2.5.0 (`f9cb470`, Codex `^0.166`) и `opencode` 2.2.5 (`caf8d6a`).
Пометка «не проверено» значит, что утверждение выведено из документации или кода, но не запускалось.

## Рычаг × агент

| Рычаг | Claude (`claude-agent-acp`) | Codex (`codex-acp`) | OpenCode (`opencode acp`) |
| --- | --- | --- | --- |
| ACP `systemPrompt` | `append` и `override` | только `append`, уходит в `developer_instructions` | нет capability |
| Иной путь к промпту | `_meta.systemPrompt`, `_meta.claudeCode.options.systemPrompt` | `CODEX_CONFIG`: `developer_instructions`, `model_instructions_file` | свой agent с `system` в `OPENCODE_CONFIG_CONTENT` |
| `instructions` MCP-сервера | да, до 4096 символов | да, как описание namespace инструментов | да, блок `<mcp_instructions>` |
| MCP prompts | команды `/mcp__server__prompt` (вызывает пользователь) | не поддерживаются | команды |
| Наши skills без установки в home | `plugins: [{type:"local", path}]` в `_meta` | `additionalDirectories`: `<dir>/.agents/skills` | `skills` в конфиге (каталоги) |
| `AGENTS.md` / `CLAUDE.md` | `CLAUDE.md` из `cwd` и выше; `AGENTS.md`, если нет `CLAUDE.md` | `AGENTS.md` из `cwd` до корня проекта и из `~/.codex` | `AGENTS.md` из `cwd` и выше и глобальный |
| Hooks | `settings.hooks` в `_meta` (command, http, mcp_tool) | `hooks` в `CODEX_CONFIG`, нужен trust | plugins из локального каталога (не проверено) |
| Режимы | `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions` | `read-only`, `workspace-write`, `agent`, `agent-full-access`, профили | primary agents как `mode` |
| Auto-approve наших MCP | `allowedTools` в `_meta`; ответ на `request_permission` | ответ на `request_permission` | правило `sensei_*` → `allow` (не проверено); ответ на `request_permission` |
| Запрет своих инструментов | `tools` / `disallowedTools` в `_meta`, на сессию | `features.shell_tool=false` в `CODEX_CONFIG`, на процесс | `deny` в permissions агента, на сессию через `mode` |
| `session/load` / `resume` / `fork` | да / да / да | да / да / да | да / да / да |
| Модель | config option `model`, `effort` | config option `model`, reasoning effort | config option `model`, `effort` |
| Расход и лимиты | `usage_update`, `_meta.quota`, `_claude/rateLimit` | `usage_update`, `_meta.quota`; лимиты только в тексте `/status` | `usage_update` с `cost`; лимитов нет |

## Подробности

### Claude

Адаптер объявляет `sessionCapabilities.systemPrompt` с режимом `override` (`src/client-system-prompt.ts`).
Режим `append` превращается в preset `claude_code` с `append`; `override` заменяет preset, а `CLAUDE.md` и инструменты остаются.
Главный рычаг — `_meta.claudeCode.options`: адаптер передаёт эти поля в `Options` Agent SDK (`src/acp-agent.ts`, `NewSessionMeta`).
Адаптер сам управляет `cwd`, `permissionMode`, `canUseTool` и `executable`. Он сливает `hooks`, `mcpServers` и `disallowedTools` со своими значениями.
Функции-callbacks не проходят через JSON-RPC, поэтому hooks задаются только через `settings.hooks`. Hook типа `http` может звать наш Fastify.
По умолчанию адаптер ставит `settingSources: ["user","project","local"]`. Наши `options` идут после этого значения и могут его заменить.
Skills Agent SDK ищет в `~/.claude/skills`, `<cwd>/.claude/skills` и в `additionalDirectories` ([docs](https://code.claude.com/docs/en/agent-sdk/skills)).
Опция `plugins` грузит plugin из локального пути. Его skills получают имя `plugin:skill`, установка в `~/.claude` не нужна.
Опция `skills` ограничивает список skills, которые может вызвать модель.
Опция `disallowedTools: ["Bash"]` убирает инструмент из контекста. Правило вида `Bash(rm *)` запрещает вызов в любом режиме ([TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript)).
`allowedTools` только одобряет инструменты заранее и ничего не запрещает.
Изменение этих опций в `session/load` или `session/resume` пересоздаёт процесс Claude (`OPTION_REBUILDS_SESSION`).
`instructions` MCP-сервера попадают в контекст, текст длиннее 4096 символов обрезается ([MCP docs](https://code.claude.com/docs/en/mcp)).
MCP prompts становятся командами. Адаптер отдаёт их в `available_commands_update` через `supportedCommands()` (передачу MCP prompts через ACP не проверяли).
Отчёт о расходе: `usage_update` и `_meta.quota.token_count` в ответе на prompt. Адаптер прикладывает к `usage_update` поле `_meta["_claude/rateLimit"]` с `rate_limit_info` подписки.

### Codex

Адаптер принимает `systemPrompt` только в режиме `append` (`src/ClientSystemPrompt.ts`).
Адаптер добавляет текст к `developer_instructions` из конфига и передаёт результат в `thread/start`. При `fork` и `resume` он отправляет этот текст снова.
Поля `_meta` для произвольных опций нет. Общий рычаг — переменная `CODEX_CONFIG`: это JSON, который адаптер сливает с конфигом каждой сессии (README, `src/index.ts`).
Значит, `CODEX_CONFIG` действует на весь процесс адаптера. Для другой конфигурации нужен отдельный процесс `codex-acp`.
Через `CODEX_CONFIG` доступны `features.shell_tool`, `web_search`, `approval_policy`, `sandbox_mode` и `skills.config` ([config reference](https://learn.chatgpt.com/docs/config-file/config-reference)).
Адаптер переносит `hooks` в `-c` при старте app-server. Запуск hook требует trust через `_codex/hooks/trust` (`src/CodexHookTrust.ts`).
Для каждого `additionalDirectories` адаптер добавляет корень skills `<dir>/.agents/skills` (`refreshSkills`).
Побочный эффект: такой каталог становится доверенным проектом и writable root sandbox.
Адаптер заменяет ключ `mcp_servers` серверами из `session/new`. Поэтому `default_tools_approval_mode` для нашего сервера через `CODEX_CONFIG`, скорее всего, теряется (не проверено).
Codex передаёт модели `instructions` MCP-сервера как `namespace_description` (`codex-rs/codex-mcp/src/rmcp_client.rs`). Вызовов `prompts/list` в коде нет.
Лимиты подписки адаптер собирает из `account/rateLimits/updated`, но показывает их только текстом команды `/status`.

### OpenCode

Сервер ACP объявляет `fork`, `resume`, `list`, `close`, `delete` и `additionalDirectories`. Capability `systemPrompt` он не объявляет (`packages/cli/src/acp/service.ts`).
`_meta` в `session/new` OpenCode не читает. Поэтому все рычаги идут через конфиг.
`opencode acp` запускает свой сервер и передаёт ему окружение. Сервер читает `OPENCODE_CONFIG`, `OPENCODE_CONFIG_CONTENT` и `OPENCODE_CONFIG_DIR` (`packages/cli/src/server-process.ts`).
Конфиг может задать agent с полями `system`, `model` и `permissions`. Непустой `system` заменяет базовый промпт ([agents](https://opencode.ai/docs/agents/)).
Primary agents становятся значениями config option `mode`. Значит, клиент выбирает agent для сессии через `session/set_config_option`.
Permissions: `deny` для `shell` и `webfetch` в нашем agent запрещает эти инструменты. Правило `allow` для `sensei_*` должно одобрить наши MCP-инструменты (вывод из [permissions](https://opencode.ai/docs/permissions/), не проверено).
Skills OpenCode ищет в `.opencode/skills`, `.claude/skills`, `.agents/skills` и глобальных каталогах. Ключ `skills` в конфиге добавляет каталоги ([skills](https://opencode.ai/docs/skills/)).
`instructions` MCP-сервера идут в блок `<mcp_instructions>` (`packages/core/src/mcp/instructions.ts`). MCP prompts становятся командами (`packages/core/src/plugin/command.ts`).
Документация описывает V2. Поведение у пользователя со старой версией OpenCode может отличаться (не проверено).

### ACP

`systemPrompt` в `session/new`, `load`, `resume` и `fork` стабилизирован 2026-11-06 (`docs/announcements/client-system-prompt-stabilized.mdx`).
По спецификации клиент шлёт поле только агенту с capability. Агент обязан вернуть ошибку, если не может применить промпт.
`session/resume`, config options с категорией `model` и `usage_update` стабилизированы. `session/fork` остаётся RFD (`docs/rfds/session-fork.mdx`).
Общий для всех агентов рычаг — ответ клиента на `session/request_permission`. Он работает только для вызовов, о которых агент спрашивает в текущем режиме.

## Выводы для дизайна

Код может гарантировать следующее:

- Claude: точный набор инструментов на сессию через `tools` / `disallowedTools`. Hooks `PreToolUse` через `settings` могут дополнительно блокировать вызовы.
- OpenCode: отдельный agent «собеседование» с `deny` для shell и web. Клиент выбирает его через `mode`.
- Codex: shell выключается только на весь процесс через `CODEX_CONFIG`. Для мок-собеседования запускаем отдельный процесс `codex-acp`.
- Наши skills подключаются без установки в home: plugin для Claude, `additionalDirectories` для Codex, `skills` в конфиге для OpenCode.
- Одобрение наших MCP-инструментов: `allowedTools` для Claude, автоответ на `request_permission` для всех трёх.
- Модель, `load`, `resume` и `fork` доступны всем трём адаптерам через стандартный ACP.

Остаётся только просьбой:

- правило «без подсказок до ответа» и стиль ведения: промпт, `instructions` и skills не мешают модели нарушить правило;
- `AGENTS.md` и `CLAUDE.md` пользователя в `cwd`: они грузятся и могут спорить с нашим промптом.
  Рычаги: `cwd` в каталоге данных приложения, `settingSources` для Claude, `OPENCODE_CONFIG_PROJECT_DISABLE` для OpenCode.
- отчёт о лимите подписки: структурно его даёт только Claude (`_claude/rateLimit`). У Codex и OpenCode показываем только токены.

Рекомендация: запускать агента с `cwd` в каталоге данных Interview Sensei. Так проект пользователя не влияет на сессию.
Промпт передаём через ACP `systemPrompt`, если агент объявил capability. Для OpenCode промпт задаёт поле `system` нашего agent.
