# Проверка настройки цели №20 / Goal setup verification for #20

## Живой прогон

Проверено 25 ноября 2026 года на macOS arm64 на ревизии `40b4a1ee4d2ef8cb9028c1121a6e5b2894116ed5`. Ollama 0.40.18 запустил `qwen3:4b` с дайджестом `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`. В журнале Ollama включён локальный режим (`Ollama cloud disabled: true`). [Инструкция для стандартных портов](../README.md#настройка-цели-с-локальной-моделью)

```bash
# Терминал Ollama / Ollama terminal
OLLAMA_HOST=127.0.0.1:53826 OLLAMA_NO_CLOUD=1 ollama serve

# Терминал проекта / Project terminal
OLLAMA_HOST=127.0.0.1:53826 ollama pull qwen3:4b
HTTP_PORT=30321 PUBLIC_ORIGIN=http://localhost:30321 \
  OLLAMA_BASE_URL=http://host.docker.internal:53826 OLLAMA_MODEL=qwen3:4b \
  docker compose -p sensei-20-review up --build -d
```

В браузере на <http://localhost:30321> отправлены три реплики, затем выполнен `docker compose -p sensei-20-review restart api` и обновлена страница. Восстановилось предложение версии 2 с первыми тремя ходами. При восстановлении число запросов к Ollama не выросло. Текст, переходы и значения сверены через публичные `GET /api/workspaces/:workspaceId/goal-setup` и `GET /api/workspaces/:workspaceId/goal-setup/turns/:turnId` в том же браузере.

Каждый ход прошёл через `load_context → interpret_message`. В таблице указан последний узел и состояние после записи.

| Реплика | Ответ, показанный в браузере | Узел и сохранённое состояние |
| --- | --- | --- |
| хочу на middle Go | На каком рынке хочешь искать работу? | `continue_conversation`, ревизия 1, Go-разработчик / middle / рынок неизвестен |
| в России | Готовиться к собеседованиям на позицию Go-разработчика уровня middle на российском рынке. | `show_proposal`, ревизия 2, предложение версии 1, рынок Россия |
| да, только senior | Готовиться к собеседованиям на позицию Go-разработчика уровня senior на российском рынке. | `show_proposal`, ревизия 3, предложение версии 2, Go-разработчик / senior / Россия |
| А рынок остался тот же? | Да, целевой рынок по-прежнему Россия. | `continue_conversation`, ревизия 4, открыто то же предложение версии 2 |
| Сформулируй цель короче | Подготовиться к собеседованиям на senior Go в России. | `show_proposal`, ревизия 5, предложение версии 3, Go-разработчик / senior / Россия |

В новой области через API отправили «Хочу на middle Go, живу в Москве». Модель спросила «На каком рынке хочешь искать работу?». В черновике сохранились роль и уровень, рынок остался неизвестным.

На промежуточном прогоне Qwen прислал `market: null` вместе с верным ответом на вопрос о рынке. После изменения схемы `null` сохраняет прежнее значение, а явный отзыв передаётся отдельным полем `withdrawn`. Автотест воспроизводит этот ответ модели.

## Управляемый прогон

```bash
SENSEI_TRACE_GOAL_SETUP=1 pnpm exec vitest run tests/http.test.ts \
  -t 'actual correction path' --silent=false
pnpm check
git diff --check
```

В трассе поправки модель получает два предыдущих хода, роль Go-разработчика, уровень middle, рынок Россия и полный текст предложения версии 1. Управляемый ответ меняет только `level` на `senior` и возвращает формулировку из третьей строки таблицы. Публичный API возвращает `load_context → interpret_message → show_proposal`, а последующее чтение из PostgreSQL показывает три хода, ревизию 3 и предложение версии 2 с прежним рынком.

На ревизии `40b4a1ee4d2ef8cb9028c1121a6e5b2894116ed5` прошли `pnpm check` и `git diff --check main...HEAD`. Полная проверка включила типы, линтеры, сборку, 11 тестов Vitest и 1 сценарий Playwright. Проверка карты принимает актуальную схему и отклоняет устаревшую копию с диагностикой. [Карта](goal-setup-graph.md)

Vitest проверяет доступ к чужой области, возврат сохранённого хода через новый экземпляр API, поздний ответ, сбой модели, явный отзыв, новую версию по просьбе изменить формулировку и повторный запуск миграций. Playwright останавливает API во время первого вызова модели, проверяет повтор с тем же идентификатором и отдельно теряет соединение до сохранения поправки. Браузер подхватывает записанный ответ, сохраняя текст следующей реплики, и восстанавливает диалог после перезапуска API. При повторе сохранённого хода браузер считывает самый свежий черновик, если за время обрыва уже добавился другой ход.

Путь реплики проходит через [клиент](../apps/web/src/goal-setup-client.ts), [HTTP-адаптер](../apps/server/src/adapters/goal-setup-http.ts), [LangGraph](../apps/server/src/modules/agent-execution/goal-setup-graph.ts), [инструкцию и схему ответа](../apps/server/src/modules/agent-execution/goal-setup-model.ts), [операции черновика](../apps/server/src/modules/goals-and-scenarios/goal-setup.ts) и [запись в PostgreSQL](../apps/server/src/adapters/storage.ts).

Живой прогон проверяет смысл ответов для конкретного диалога. Подтверждение предложения относится к задаче №21, подключение AITUNNEL — к задаче №22. [Задача №20](https://github.com/KirillSachkov/interview-sensei/issues/20)

## English

### Live run

Verified on macOS arm64 on November 25, 2026 at revision `40b4a1ee4d2ef8cb9028c1121a6e5b2894116ed5`. Ollama 0.40.18 ran `qwen3:4b` with digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`. The Ollama log reported `Ollama cloud disabled: true`. Use the commands above for the exact ports used in this run. [Instructions for the standard ports](../README.en.md#goal-setup-with-a-local-model)

The first three messages were submitted at <http://localhost:30321>. After `docker compose -p sensei-20-review restart api` and a page reload, the browser restored proposal version 2 and the first three turns. The Ollama request count stayed the same during restoration. The public `GET /api/workspaces/:workspaceId/goal-setup` and `GET /api/workspaces/:workspaceId/goal-setup/turns/:turnId` endpoints returned the saved text, paths and details in the same browser.

Each turn passed through `load_context → interpret_message`. The table shows the final node and the saved state. The messages and replies are reproduced in Russian.

| Message | Reply shown in the browser | Node and saved state |
| --- | --- | --- |
| хочу на middle Go | На каком рынке хочешь искать работу? | `continue_conversation`, revision 1, Go developer / middle / unknown market |
| в России | Готовиться к собеседованиям на позицию Go-разработчика уровня middle на российском рынке. | `show_proposal`, revision 2, proposal version 1, market Russia |
| да, только senior | Готовиться к собеседованиям на позицию Go-разработчика уровня senior на российском рынке. | `show_proposal`, revision 3, proposal version 2, Go developer / senior / Russia |
| А рынок остался тот же? | Да, целевой рынок по-прежнему Россия. | `continue_conversation`, revision 4, the same proposal version 2 remains open |
| Сформулируй цель короче | Подготовиться к собеседованиям на senior Go в России. | `show_proposal`, revision 5, proposal version 3, Go developer / senior / Russia |

In a fresh workspace, the API received “Хочу на middle Go, живу в Москве” (I want a middle Go role and live in Moscow). The model asked “На каком рынке хочешь искать работу?” (Which market do you want to look for work in?). The draft stored the role and level and left the market unknown.

During an intermediate run Qwen returned `market: null` alongside a correct answer to the market question. The updated schema preserves the existing value for `null` and uses a separate `withdrawn` field for explicit withdrawals. An automated test reproduces that model response.

### Controlled run

Run the commands from the controlled run section above. For the correction, the model receives the two previous turns, the Go developer role, middle level, Russia as the market, and the exact wording of proposal version 1. The controlled response changes only `level` to `senior` and returns the wording in the third row of the table. The public API returns `load_context → interpret_message → show_proposal`. The subsequent PostgreSQL read returns three turns, revision 3 and proposal version 2 with the earlier market.

At revision `40b4a1ee4d2ef8cb9028c1121a6e5b2894116ed5`, `pnpm check` passed type checking, lint, build, 11 Vitest tests and one Playwright scenario. `git diff --check main...HEAD` passed. The map check accepts the current map and rejects a stale copy with a diagnostic. [Map](goal-setup-graph.md)

Vitest covers access to another workspace, replay of a saved turn through a fresh API instance, a late response, model failure, explicit withdrawal, a new version after a rewording request, and a migration rerun. Playwright stops the API during the first model call, checks a retry with the same ID and separately drops the connection before the correction is saved. The browser picks up the saved reply while preserving the text of the next message and restores the dialogue after an API restart. When it replays a saved turn, the browser reads the latest draft if another turn was saved during the interruption.

A message passes through the [client](../apps/web/src/goal-setup-client.ts), [HTTP adapter](../apps/server/src/adapters/goal-setup-http.ts), [LangGraph](../apps/server/src/modules/agent-execution/goal-setup-graph.ts), [instructions and response schema](../apps/server/src/modules/agent-execution/goal-setup-model.ts), [draft operations](../apps/server/src/modules/goals-and-scenarios/goal-setup.ts) and the [PostgreSQL write](../apps/server/src/adapters/storage.ts).

The live run checks reply meaning for this dialogue. Proposal confirmation is tracked in #21 and the AITUNNEL connection in #22. [Issue #20](https://github.com/KirillSachkov/interview-sensei/issues/20)
