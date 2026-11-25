# Interview Sensei

We are building Interview Sensei for people preparing for interviews in tech. It will help candidates prepare for a target role or a specific job opening, take mock interviews, and see which topics to revisit.

[Русский](README.md)

## First guest visit

With Docker Compose installed, run `docker compose up --build -d` and open <http://localhost:3000>. The API migrates the database and serves the built client. The worker connects to the same database. After `docker compose restart api` and a browser restart, the persistent cookie restores the workspace. A separate browser profile opens a new workspace. Run `docker compose down` to stop the app and keep the volume. For a different port, set both `HTTP_PORT` and its matching `PUBLIC_ORIGIN`.

Checks require Docker, Git and the Node version in `.node-version`. Run `npm install --global corepack@0.36.0`, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm exec playwright install chromium`, then `pnpm check`. On a fresh Linux machine install Chromium with `--with-deps`. Vitest starts a separate PostgreSQL with Testcontainers. Playwright starts its own Compose project.

The entry path starts at `apps/web/src/main.tsx`. The loader and HTTP adapter use `packages/contracts`. The composition root in `apps/server/src/api.ts` connects HTTP and PostgreSQL adapters to the public operation in `goals-and-scenarios/index.ts`. The workspace and session secret hash are written in one transaction. Sessions last 90 days.

[ADR 0001](docs/adr/0001-module-ownership.md) defines the six owners. Each exposes `apps/server/src/modules/<module>/index.ts`. Agent Execution uses the public types of Goals and Scenarios and receives its operations at the composition root. Dependency rules live in `.dependency-cruiser.cjs` and diagnostic examples in `tools/check-rules.ts`.

## Goal setup with a local model

Install Ollama on the development machine. Start the local service in a separate terminal. [Ollama instructions](https://docs.ollama.com/)

```bash
OLLAMA_NO_CLOUD=1 ollama serve
```

In a second terminal, download the model and start the app:

```bash
ollama pull qwen3:4b
OLLAMA_BASE_URL=http://host.docker.internal:11434 OLLAMA_MODEL=qwen3:4b \
  docker compose up --build -d
```

On Linux with Docker Engine, bind Ollama to the Docker gateway. Set `OLLAMA_HOST` in both terminals before running `ollama serve` and `ollama pull`:

```bash
export OLLAMA_HOST="$(docker network inspect bridge --format '{{(index .IPAM.Config 0).Gateway}}'):11434"
```

Open <http://localhost:3000>. Enter “хочу на middle Go”, then “в России” and “да, только senior”. Reload the page to see proposal version 2 and the dialogue history. The API uses the configured local Ollama instance for replies. This run works without an AITUNNEL key.

To update the [goal setup map](docs/goal-setup-graph.md), run `pnpm build && pnpm goal-setup:map`. `pnpm check` compares the map with the executable graph and exercises the dialogue with controlled replies. See the [verification for issue #20](docs/goal-setup-verification.md) for commands and observations from the live run.
