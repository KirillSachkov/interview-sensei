// The components of speech recognition on a local HTTP server for the API tests (spec #74): the
// test can hold a file's response halfway to see the progress of a download.
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { onTestFinished } from "vitest";

/** A held response or recognition: `reached` once it stops, until the test calls `release`. */
export interface Hold {
  readonly reached: Promise<unknown>;
  readonly release: () => void;
}

/** A hold that starts unreached and unreleased. */
export function newHold() {
  const reached = Promise.withResolvers<null>();
  const released = Promise.withResolvers<null>();
  return {
    reached: reached.promise,
    reach: () => {
      reached.resolve(null);
    },
    released: released.promise,
    release: () => {
      released.resolve(null);
    },
  };
}

type HeldResponse = ReturnType<typeof newHold>;

/** Sends the first half of the file, then the rest once the test releases the hold. */
async function sendHeld(response: ServerResponse, bytes: Buffer, hold: HeldResponse) {
  const half = Math.floor(bytes.length / 2);
  response.write(bytes.subarray(0, half), () => {
    hold.reach();
  });
  await hold.released;
  response.end(bytes.subarray(half));
}

/** Records the request and gives the hold the test set for the file's next response, once. */
function takeHold(
  { holds, requested }: { holds: Map<string, HeldResponse>; requested: string[] },
  name: string,
): HeldResponse | undefined {
  requested.push(name);
  const hold = holds.get(name);
  holds.delete(name);
  return hold;
}

/** The answer of the component server: the file, held when the test asked to hold it. */
function respond(
  {
    files,
    holds,
    requested,
  }: {
    files: ReadonlyMap<string, Buffer>;
    holds: Map<string, HeldResponse>;
    requested: string[];
  },
  request: IncomingMessage,
  response: ServerResponse,
): void {
  const name = (request.url ?? "").slice(1);
  const bytes = files.get(name);
  if (bytes === undefined) {
    response.writeHead(404).end();
    return;
  }
  const hold = takeHold({ holds, requested }, name);
  response.writeHead(200, { "content-length": bytes.length });
  if (hold === undefined) {
    response.end(bytes);
  } else {
    void sendHeld(response, bytes, hold);
  }
}

/** Listens on a free loopback port until the test finishes; resolves with the port. */
async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  onTestFinished(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("The component server does not listen");
  }
  return address.port;
}

/**
 * The files of the components on a local HTTP server. `hold(name)` makes the next response of
 * that file stop halfway until the test releases it; `requested` lists the files asked for.
 */
export async function componentServer(files: ReadonlyMap<string, Buffer>) {
  const state = { files, holds: new Map<string, HeldResponse>(), requested: [] as string[] };
  const port = await listen(
    createServer((request, response) => {
      respond(state, request, response);
    }),
  );
  return {
    base: `http://127.0.0.1:${port}`,
    requested: state.requested,
    hold: (name: string): Hold => {
      const hold = newHold();
      state.holds.set(name, hold);
      return hold;
    },
  };
}
