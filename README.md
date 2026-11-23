# Interview Sensei

Мы разрабатываем Interview Sensei для тех, кто готовится к собеседованиям в ИТ. Сервис поможет готовиться к выбранной роли или конкретной вакансии, проходить пробные собеседования и видеть, какие темы стоит повторить.

[English](README.en.md)

## Первый гостевой вход

С установленным Docker Compose выполни `docker compose up --build -d` и открой <http://localhost:3000>. API применяет миграции и раздаёт собранный клиент, worker подключается к той же БД. После `docker compose restart api` и повторного запуска браузера постоянная cookie возвращает прежнюю область. В другом профиле откроется новая. Команда `docker compose down` останавливает приложение и сохраняет том. Для другого порта задай одновременно `HTTP_PORT` и соответствующий `PUBLIC_ORIGIN`.

Для проверок нужны Docker, Git и Node из `.node-version`. Выполни `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium`, затем `pnpm check`. На чистом Linux устанавливай Chromium с `--with-deps`. Vitest запускает отдельный PostgreSQL через Testcontainers, Playwright поднимает собственный проект Compose.

Путь входа начинается в `apps/web/src/main.tsx`. Загрузчик и HTTP-адаптер используют `packages/contracts`. Точка сборки `apps/server/src/api.ts` связывает адаптеры HTTP и PostgreSQL с публичной операцией `goals-and-scenarios/index.ts`. Область и хеш секрета сессии записываются одной транзакцией. Срок сессии — 90 дней.

Владельцы шести модулей описаны в [ADR 0001](docs/adr/0001-module-ownership.md). Публичный вход каждого — `apps/server/src/modules/<module>/index.ts`. Межмодульные зависимости пока закрыты. Правила графа заданы в `.dependency-cruiser.cjs`, проверочные примеры — в `tools/check-rules.ts`.
