# Interview Sensei

We are building Interview Sensei for people preparing for interviews in tech. It will help candidates prepare for a target role or a specific job opening, take mock interviews, and see which topics to revisit.

[Русский](README.md)

## First guest visit

With Docker Compose installed, run `docker compose up --build -d` and open <http://localhost:3000>. The API migrates the database and serves the built client. The worker connects to the same database. After `docker compose restart api` and a browser restart, the persistent cookie restores the workspace. A separate browser profile opens a new workspace. Run `docker compose down` to stop the app and keep the volume. For a different port, set both `HTTP_PORT` and its matching `PUBLIC_ORIGIN`.

Checks require Docker, Git and the Node version in `.node-version`. Run `npm install --global corepack@0.36.0`, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium`, then `pnpm check`. On a fresh Linux machine install Chromium with `--with-deps`. Vitest starts a separate PostgreSQL with Testcontainers. Playwright starts its own Compose project.

The entry path starts at `apps/web/src/main.tsx`. The loader and HTTP adapter use `packages/contracts`. The composition root in `apps/server/src/api.ts` connects HTTP and PostgreSQL adapters to the public operation in `goals-and-scenarios/index.ts`. The workspace and session secret hash are written in one transaction. Sessions last 90 days.

[ADR 0001](docs/adr/0001-module-ownership.md) defines the six owners. Each exposes `apps/server/src/modules/<module>/index.ts`. Cross-module dependencies are currently closed. Graph rules live in `.dependency-cruiser.cjs` and diagnostic examples in `tools/check-rules.ts`.
