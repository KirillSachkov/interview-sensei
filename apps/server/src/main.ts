import { systemClock } from "@interview-sensei/core/time";

import { buildServer } from "./server.ts";

// Local application: listen on the loopback interface only.
const host = process.env.SERVER_HOST ?? "127.0.0.1";
const port = Number(process.env.SERVER_PORT ?? "4310");

const server = buildServer({ clock: systemClock, logger: true });

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void server.close();
  });
}

await server.listen({ host, port });
