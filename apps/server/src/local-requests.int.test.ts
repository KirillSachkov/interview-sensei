// The server answers only the Candidate's own browser (#23): a page of another site reaches it
// neither through DNS rebinding, with a foreign Host, nor directly, with a foreign Origin.
import { request } from "node:http";
import type { IncomingHttpHeaders } from "node:http";

import type { FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { startServer, temporaryDirectory } from "./chat-test-support.ts";

function portOf(server: FastifyInstance): number {
  const [address] = server.addresses();
  if (address === undefined) {
    throw new Error("The server does not listen");
  }
  return address.port;
}

/**
 * Sends one request over real HTTP with exactly these headers, which fetch would not let the test
 * set. Resolves with the status; 101 means the WebSocket upgrade passed.
 */
async function send(
  port: number,
  {
    method = "GET",
    path,
    headers,
  }: { method?: string; path: string; headers: IncomingHttpHeaders },
  body?: object,
): Promise<number> {
  const sent = Promise.withResolvers<number>();
  // A connection of its own: the server closes the connection of a refused upgrade.
  const outgoing = request({
    host: "127.0.0.1",
    port,
    method,
    path,
    headers,
    setHost: false,
    agent: false,
  });
  outgoing.on("response", (response) => {
    response.resume();
    sent.resolve(response.statusCode ?? 0);
  });
  outgoing.on("upgrade", (_response, socket) => {
    socket.destroy();
    sent.resolve(101);
  });
  outgoing.on("error", sent.reject);
  outgoing.end(body === undefined ? undefined : JSON.stringify(body));
  return sent.promise;
}

const newChat = { kind: "service-chat", agent: "fake" };

async function startChat(port: number, origin: string): Promise<number> {
  return send(
    port,
    {
      method: "POST",
      path: "/api/sessions",
      headers: { host: `127.0.0.1:${port}`, origin, "content-type": "application/json" },
    },
    newChat,
  );
}

const upgrade = {
  connection: "Upgrade",
  upgrade: "websocket",
  "sec-websocket-version": "13",
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
};

async function openEvents(port: number, origin?: string): Promise<number> {
  const sessions = await send(port, {
    path: "/api/sessions",
    headers: { host: `127.0.0.1:${port}` },
  });
  expect(sessions).toBe(200);
  return send(port, {
    path: "/api/sessions/00000000-0000-4000-8000-000000000000/events",
    headers: {
      host: `127.0.0.1:${port}`,
      ...upgrade,
      ...(origin === undefined ? {} : { origin }),
    },
  });
}

describe("local requests only", () => {
  it.each(["attacker.example", "192.168.1.10"])(
    "refuses a request with the foreign Host %s, as after DNS rebinding",
    async (hostname) => {
      const { server } = await startServer(await temporaryDirectory());
      const port = portOf(server);

      await expect(
        send(port, { path: "/api/health", headers: { host: `${hostname}:${port}` } }),
      ).resolves.toBe(403);
    },
  );

  it.each(["127.0.0.1:1", "localhost"])(
    "refuses a request with the loopback Host %s of another port",
    async (host) => {
      const { server } = await startServer(await temporaryDirectory());

      await expect(send(portOf(server), { path: "/api/health", headers: { host } })).resolves.toBe(
        403,
      );
    },
  );

  it.each(["127.0.0.1", "localhost", "[::1]"])(
    "answers a request with the loopback Host %s and the server's port",
    async (hostname) => {
      const { server } = await startServer(await temporaryDirectory());
      const port = portOf(server);

      await expect(
        send(port, { path: "/api/health", headers: { host: `${hostname}:${port}` } }),
      ).resolves.toBe(200);
    },
  );

  it("starts a chat from the server's own origin", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const port = portOf(server);

    await expect(startChat(port, `http://127.0.0.1:${port}`)).resolves.toBe(201);
    await expect(startChat(port, `http://localhost:${port}`)).resolves.toBe(201);
  });

  it.each(["http://attacker.example", "http://127.0.0.1:5173", "null"])(
    "refuses to start a chat from the foreign origin %s",
    async (origin) => {
      const { server } = await startServer(await temporaryDirectory());

      await expect(startChat(portOf(server), origin)).resolves.toBe(403);
    },
  );

  it("refuses to start a chat without an Origin", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const port = portOf(server);

    await expect(
      send(
        port,
        {
          method: "POST",
          path: "/api/sessions",
          headers: { host: `127.0.0.1:${port}`, "content-type": "application/json" },
        },
        newChat,
      ),
    ).resolves.toBe(403);
  });

  it("opens the session WebSocket only from the server's own origin", async () => {
    const { server } = await startServer(await temporaryDirectory());
    const port = portOf(server);

    await expect(openEvents(port, `http://127.0.0.1:${port}`)).resolves.toBe(101);
    await expect(openEvents(port, "http://attacker.example")).resolves.toBe(403);
    await expect(openEvents(port)).resolves.toBe(403);
  });

  it("takes the dev origin of pnpm dev only when the server allows it", async () => {
    const devOrigin = "http://127.0.0.1:5173";
    const { server } = await startServer(await temporaryDirectory(), {
      allowedOrigins: [devOrigin],
    });
    const port = portOf(server);

    await expect(startChat(port, devOrigin)).resolves.toBe(201);
    await expect(openEvents(port, devOrigin)).resolves.toBe(101);
    await expect(startChat(port, "http://127.0.0.1:5174")).resolves.toBe(403);
  });
});
