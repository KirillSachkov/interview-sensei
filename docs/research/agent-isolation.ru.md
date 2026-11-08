# Изоляция агента от настроек пользователя

Документ отвечает на issue #15. Дата проверки: 2026-11-08.
Проверены `claude-agent-acp` 0.101.0 (Agent SDK 0.3.318), `codex-acp` 2.5.0 (Codex 0.165.0) и `opencode acp` 1.18.30.
Основа: [рычаги контекста](https://github.com/KirillSachkov/interview-sensei/blob/research/acp-context-levers/docs/research/acp-context-levers.ru.md) и [прототип ACP-моста](https://github.com/KirillSachkov/interview-sensei/blob/prototype/acp-bridge/prototypes/acp-bridge/FINDINGS.ru.md).

## Ответ

Изоляция с сохранением входа по подписке возможна у всех трёх агентов. Способы разные.
- Claude: каталог конфигурации менять нельзя. Изоляцию дают опции SDK в `_meta`.
- Codex: нужен свой `CODEX_HOME` с symlink на `auth.json` пользователя и свой `HOME`.
- OpenCode: нужен свой `XDG_CONFIG_HOME` и флаги `OPENCODE_DISABLE_*`. Каталог данных с `auth.json` остаётся общим или подключается через symlink.

Каждый рецепт проверен запуском `initialize` и `session/new` во временном `cwd`. Для Claude и Codex один короткий prompt подтвердил: инструкции пользователя в контекст не попали.

## Что утекает × агент × как изолировать × влияние на вход

| Что утекает | Claude | Codex | OpenCode |
| --- | --- | --- | --- |
| Глобальные инструкции | `~/.claude/CLAUDE.md`, `~/.claude/rules/*.md` → `settingSources: []` | `$CODEX_HOME/AGENTS.md` → свой `CODEX_HOME` | `~/.config/opencode/AGENTS.md`, `~/.claude/CLAUDE.md` → `XDG_CONFIG_HOME`, `OPENCODE_DISABLE_CLAUDE_CODE=1` |
| Проектные инструкции | `CLAUDE.md` в `cwd` и выше → `settingSources: []` | `AGENTS.md` от корня git до `cwd` → `cwd` вне git, `project_doc_max_bytes = 0` | `AGENTS.md`/`CLAUDE.md` выше `cwd` → `OPENCODE_DISABLE_PROJECT_CONFIG=1` |
| User skills | `~/.claude/skills` → `settingSources: []`, `skills: []` | `~/.agents/skills` (по `$HOME`), `$CODEX_HOME/skills` → свои `HOME` и `CODEX_HOME` | `~/.claude/skills`, `~/.agents/skills` → `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` |
| Встроенные skills | `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1` | `[skills.bundled] enabled = false` в нашем `config.toml` | `customize-opencode` остаётся |
| Slash-команды, plugins, hooks, output style | user `settings.json` → `settingSources: []` | `config.toml`, `hooks.json`, `plugins/` → свой `CODEX_HOME` | `~/.config/opencode/{plugins,commands,agents}` → `XDG_CONFIG_HOME` |
| MCP-серверы пользователя | `~/.claude.json`, plugins → `strictMcpConfig: true` | `config.toml` → свой `CODEX_HOME` | `opencode.json` → `XDG_CONFIG_HOME` |
| Коннекторы claude.ai | `ENABLE_CLAUDEAI_MCP_SERVERS=false` | apps и plugins ChatGPT → свой `CODEX_HOME` | нет |
| Память | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` | `memories` в `CODEX_HOME` → свой `CODEX_HOME` | нет |
| Режим разрешений | `permissions.defaultMode` утекает даже при `settingSources: []` → `allowDangerouslySkipPermissions: false` и `session/set_mode` | `approval_policy`, `sandbox_mode` → свой `CODEX_HOME`, `INITIAL_AGENT_MODE` | режимов нет |
| Влияние на вход | нет: Keychain общий | `auth.json` через symlink работает; пустой `CODEX_HOME` даёт `Authentication required` | `auth.json` в `XDG_DATA_HOME` не затронут |

## Рецепты

### Claude

```js
spawn("claude-agent-acp", [], { cwd: dataDir, env: { ...process.env,
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
  ENABLE_CLAUDEAI_MCP_SERVERS: "false",
  CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1" } });
// session/new
{ cwd: sessionDir, mcpServers: [ours], _meta: { claudeCode: { options: {
  settingSources: [], strictMcpConfig: true, skills: [],
  allowDangerouslySkipPermissions: false } } } }
// затем session/set_mode { modeId: "default" }
```

Проверка: без изоляции сессия объявила 78 команд, включая user skills и skills из plugins. С рецептом осталось 39 встроенных команд CLI.
Prompt о загруженных файлах вернул `NONE — no language was specified`. Правило «отвечать по-русски» из `~/.claude/rules` не загрузилось.
`_auth/status_update` в обоих случаях сообщил `Claude Max`.

`settingSources: []` не убирает режим разрешений пользователя. `SettingsManager` адаптера читает настройки через `resolveSettings({ cwd })` без `settingSources` (`dist/settings.js`).
Поэтому сессия стартовала в `bypassPermissions` из `~/.claude/settings.json`. Опция `allowDangerouslySkipPermissions: false` перевела её в `default`.
Адаптер перезаписывает `permissionMode` после наших `options` (`dist/acp-agent.js`, сборка `options`). Режимы `plan`, `acceptEdits` и `auto` из настроек пользователя остаются, поэтому нужен явный `session/set_mode`.

`CLAUDE_CONFIG_DIR` ломает вход. Claude Code привязывает запись Keychain к каталогу конфигурации ([authentication](https://code.claude.com/docs/en/authentication#credential-management)).
Запуск с пустым `CLAUDE_CONFIG_DIR` вернул `authStatus: none`. Symlink не помогает, потому что на macOS токен лежит в Keychain, а не в файле.
Обход через `claude setup-token` и `CLAUDE_CODE_OAUTH_TOKEN` требует действия пользователя. Такой токен делает только запросы к модели.

### Codex

```sh
# один раз: наш каталог
mkdir -p "$DATA/codex-home" "$DATA/home"
ln -s "${USER_CODEX_HOME:-$HOME/.codex}/auth.json" "$DATA/codex-home/auth.json"
printf 'project_doc_max_bytes = 0\n\n[skills.bundled]\nenabled = false\n' > "$DATA/codex-home/config.toml"
# запуск
CODEX_HOME="$DATA/codex-home" HOME="$DATA/home" INITIAL_AGENT_MODE=read-only codex-acp
```

`project_doc_max_bytes = 0` отключает проектные `AGENTS.md` (`load_project_instructions` в `core/src/agents_md.rs`, по коду).
В недоверенном проекте Codex проектные `AGENTS.md` не читает вообще. В новом `CODEX_HOME` наш `cwd` не доверен.
Проверка: без изоляции сессия объявила 88 skills, включая apps и plugins ChatGPT. Только `CODEX_HOME` оставил 18 skills из `~/.agents/skills` и системные.
Codex ищет `~/.agents/skills` через `dirs::home_dir()`, а не через `CODEX_HOME` (`ext/skills/src/host_roots.rs`). Поэтому нужен свой `HOME`.
С полным рецептом остались 11 встроенных команд. Prompt вернул `NONE; reply language: none specified`, вход — `ChatGPT Pro`.
`[skills.bundled]` работает только в `config.toml`. В `CODEX_CONFIG` эта настройка не подействовала.

Symlink на `auth.json` безопасен. `FileAuthStorage::save` открывает файл с `truncate` и пишет в него, без `rename` (`login/src/auth/storage.rs`). Запись идёт по symlink, и файл пользователя обновляется.
Перед refresh Codex перечитывает `auth.json` с диска (`reload_if_account_id_matches`, `login/src/auth/manager.rs`). Так он берёт токен, который обновил другой процесс.
После прогонов `auth.json` в нашем каталоге остался symlink.
Копия `auth.json` опасна. Refresh в одной копии обновляет refresh token, и вторая копия устаревает. Codex обрабатывает такой случай как ошибку `refresh_token_reused`, и нужен повторный вход.

### OpenCode

```sh
XDG_CONFIG_HOME="$DATA/oc-config" \
OPENCODE_DISABLE_CLAUDE_CODE=1 OPENCODE_DISABLE_EXTERNAL_SKILLS=1 \
OPENCODE_DISABLE_PROJECT_CONFIG=1 \
OPENCODE_CONFIG_CONTENT='{"model":"…","agent":{…}}' opencode acp
```

Проверка: без изоляции сессия объявила 16 команд, включая user skills. С рецептом остались `customize-opencode`, `init` и `review`.
`OPENCODE_CONFIG_DIR` не заменяет глобальный конфиг. OpenCode читает `opencode.json`, plugins и agents из `xdgConfig/opencode` в любом случае (`config/paths.ts`, `config/config.ts`). Поэтому нужен `XDG_CONFIG_HOME`.
Ключи провайдеров лежат в `$XDG_DATA_HOME/opencode/auth.json` (`auth/index.ts`). Общий каталог данных сохраняет вход, но наши сессии попадут в `opencode.db` пользователя.
Свой `XDG_DATA_HOME` с symlink на `auth.json` тоже работает: модель предложила 87 моделей против 11 без `auth.json`. Запись идёт через `writeFileString` по symlink.
Модель по умолчанию приходит из конфига пользователя. Поэтому модель задаём в `OPENCODE_CONFIG_CONTENT`.

## Что изолировать нельзя

- Claude: managed settings (`/Library/Application Support/ClaudeCode`, MDM) и server-managed settings организации. Файл `~/.claude.json` читается всегда ([docs](https://code.claude.com/docs/en/agent-sdk/claude-code-features#what-settingsources-does-not-control)).
- Claude: `permissions.defaultMode` пользователя через `SettingsManager` адаптера. Его перекрывает только `session/set_mode`.
- Codex: системный `/etc/codex/config.toml` и managed requirements.
- Codex: вход в keyring. Если пользователь выбрал `cli_auth_credentials_store = "keyring"`, ключ записи — хэш пути `CODEX_HOME` (`compute_store_key`). Свой `CODEX_HOME` вход не найдёт.
- OpenCode: каталог `~/.opencode` в `HOME`, встроенный skill `customize-opencode` и remote config провайдеров через `.well-known`.
- Все: файлы на диске остаются доступны через инструменты чтения и shell. Список skills — фильтр контекста, а не sandbox.

## Риски

1. Свои `HOME` и `XDG_CONFIG_HOME` видят и дочерние процессы. `git`, `gh` и `ssh` в shell агента потеряют настройки пользователя. Для собеседования shell всё равно запрещаем.
2. OpenCode при первом запуске ставит npm-пакет `@opencode-ai/plugin` в наш `XDG_CONFIG_HOME`. Это сетевой запрос.
3. Два процесса Codex могут одновременно обновить токен. Блокировка refresh действует только внутри процесса. Этот риск уже есть при нескольких окнах Codex.
4. Адаптеры меняются быстро. Поведение `defaultMode` и `[skills.bundled]` перепроверяем при обновлении версий.
5. Корень git выше `cwd` возвращает проектный `AGENTS.md` для Codex. Каталог данных не должен лежать внутри репозитория; `project_doc_max_bytes = 0` страхует.

## Источники

- Claude Agent SDK: [Claude Code features](https://code.claude.com/docs/en/agent-sdk/claude-code-features), [authentication](https://code.claude.com/docs/en/authentication), [env vars](https://code.claude.com/docs/en/env-vars); `sdk.d.ts` 0.3.318 (`settingSources`, `strictMcpConfig`, `skills`).
- `claude-agent-acp` 0.101.0: `dist/acp-agent.js`, `dist/settings.js`, `dist/session-mode.js`, `dist/auth-status.js`.
- `codex-acp` 2.5.0: `README.md`, `dist/index.js`. Codex `rust-v0.165.0` ([openai/codex](https://github.com/openai/codex)): `login/src/auth/storage.rs`, `login/src/auth/manager.rs`, `config/src/types.rs`, `config/src/skills_config.rs`, `ext/skills/src/host_roots.rs`, `core/src/agents_md.rs`.
- OpenCode `v1.18.30` ([anomalyco/opencode](https://github.com/anomalyco/opencode)): `packages/core/src/global.ts`, `packages/opencode/src/config/{config,paths}.ts`, `session/instruction.ts`, `skill/index.ts`, `auth/index.ts`, `effect/runtime-flags.ts`.
- Опыты: временные `cwd` и каталоги в `/tmp/iso-runs`, только `initialize` и `session/new`, по одному prompt для Claude и Codex.
