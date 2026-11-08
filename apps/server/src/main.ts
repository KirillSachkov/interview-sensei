// The server for `pnpm dev`, without the web app: Vite serves it and forwards /api here.
import { runServer } from "./run-server.ts";

await runServer();
