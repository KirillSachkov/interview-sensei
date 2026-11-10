import { describe, expect, it } from "vitest";

import { tarFiles } from "./tar.ts";

/** A ustar header block with the name, mode, size and type. */
function header(name: string, size: number, type = "0"): Uint8Array {
  const bytes = new Uint8Array(512);
  const encoder = new TextEncoder();
  bytes.set(encoder.encode(name), 0);
  bytes.set(encoder.encode("0000755\0"), 100);
  bytes.set(encoder.encode(`${size.toString(8).padStart(11, "0")}\0`), 124);
  bytes.set(encoder.encode(type), 156);
  bytes.set(encoder.encode("ustar\0"), 257);
  return bytes;
}

/** An archive of the entries: each header, its content padded to 512 bytes, then two zero blocks. */
function archive(entries: readonly { name: string; text: string; type?: string }[]): Uint8Array {
  const parts = entries.flatMap(({ name, text, type }) => {
    const content = new TextEncoder().encode(text);
    const padded = new Uint8Array(Math.ceil(content.length / 512) * 512);
    padded.set(content);
    return [header(name, content.length, type), padded];
  });
  const all = [...parts, new Uint8Array(1024)];
  const bytes = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of all) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

describe(tarFiles, () => {
  it("reads the regular files of an npm tarball with their mode and skips directories", () => {
    const files = tarFiles(
      archive([
        { name: "package/", text: "", type: "5" },
        { name: "package/package.json", text: '{"name":"x"}' },
        { name: "package/lib/addon.js", text: "x".repeat(700) },
      ]),
    );
    expect(
      files.map(({ name, mode, bytes }) => ({ name, mode, size: bytes.length })),
    ).toStrictEqual([
      { name: "package/package.json", mode: 0o755, size: 12 },
      { name: "package/lib/addon.js", mode: 0o755, size: 700 },
    ]);
    expect(new TextDecoder().decode(files[0]?.bytes)).toBe('{"name":"x"}');
  });

  it("refuses a name that leaves its directory and a truncated archive", () => {
    expect(() => tarFiles(archive([{ name: "package/../../evil", text: "x" }]))).toThrow(
      "unsafe name",
    );
    expect(() =>
      tarFiles(archive([{ name: "a", text: "x".repeat(600) }]).subarray(0, 900)),
    ).toThrow("truncated");
  });
});
