# Interview Sensei

Мы разрабатываем Interview Sensei для тех, кто готовится к собеседованиям в ИТ. Сервис поможет готовиться к выбранной роли или конкретной вакансии, проходить пробные собеседования и видеть, какие темы стоит повторить.

[English](README.en.md)

## Первый гостевой вход

С установленным Docker Compose выполни `docker compose up --build -d` и открой <http://localhost:3000>. API применяет миграции и раздаёт собранный клиент, worker подключается к той же БД. После `docker compose restart api` и повторного запуска браузера постоянная cookie возвращает прежнюю область. В другом профиле откроется новая. Команда `docker compose down` останавливает приложение и сохраняет том. Для другого порта задай одновременно `HTTP_PORT` и соответствующий `PUBLIC_ORIGIN`.

Для проверок нужны Docker, Git и Node из `.node-version`. Выполни `npm install --global corepack@0.36.0`, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium`, затем `pnpm check`. На чистом Linux устанавливай Chromium с `--with-deps`. Vitest запускает отдельный PostgreSQL через Testcontainers, Playwright поднимает собственный проект Compose.

Путь входа начинается в `apps/web/src/main.tsx`. Загрузчик и HTTP-адаптер используют `packages/contracts`. Точка сборки `apps/server/src/api.ts` связывает адаптеры HTTP и PostgreSQL с публичной операцией `goals-and-scenarios/index.ts`. Область и хеш секрета сессии записываются одной транзакцией. Срок сессии — 90 дней.

Владельцы шести модулей описаны в [ADR 0001](docs/adr/0001-module-ownership.md). Публичный вход каждого — `apps/server/src/modules/<module>/index.ts`. Агентский слой использует публичные типы «Целей и сценариев» и получает операции при сборке приложения. Правила зависимостей заданы в `.dependency-cruiser.cjs`, проверочные примеры — в `tools/check-rules.ts`.

## Настройка цели с локальной моделью

Установи Ollama на машину разработчика. Запусти локальный сервис в отдельном терминале. [Инструкция Ollama](https://docs.ollama.com/)

```bash
OLLAMA_NO_CLOUD=1 ollama serve
```

Во втором терминале скачай модель и запусти приложение:

```bash
ollama pull qwen3:4b
OLLAMA_BASE_URL=http://host.docker.internal:11434 OLLAMA_MODEL=qwen3:4b \
  docker compose up --build -d
```

На Linux с Docker Engine привяжи Ollama к шлюзу Docker. Перед `ollama serve` и `ollama pull` задай в обоих терминалах `OLLAMA_HOST`:

```bash
export OLLAMA_HOST="$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}'):11434"
```

Открой <http://localhost:3000>. Напиши «хочу на middle Go», затем «в России» и «да, только senior». После обновления страницы увидишь предложение версии 2 и историю. Для ответов API использует указанный локальный Ollama. Ключ AITUNNEL для этого прогона не нужен.

Чтобы обновить [карту настройки](docs/goal-setup-graph.md), выполни `pnpm build && pnpm goal-setup:map`. `pnpm check` сверяет карту с исполняемым графом и проверяет диалог с управляемыми ответами. Команды и наблюдения живого прогона записаны в [проверке задачи №20](docs/goal-setup-verification.md).
