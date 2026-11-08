// The server for `pnpm dev`, without the web app: Vite serves it and forwards /api here.
import { runServer } from "./run-server.ts";

// The page comes from the Vite dev server, so its origin is Vite's, not the server's own.
const webPort = process.env.WEB_PORT ?? "5173";

await runServer({ allowedOrigins: [`http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`] });
