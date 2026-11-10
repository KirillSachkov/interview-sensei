// The regular files of an uncompressed ustar archive, such as an npm package tarball after gunzip.
// Node has no tar reader, and npm tarballs need nothing beyond ustar names and sizes.

/** A regular file of the archive: its path inside the archive, its mode and its bytes. */
export interface TarFile {
  readonly name: string;
  readonly mode: number;
  readonly bytes: Uint8Array;
}

const block = 512;
const decoder = new TextDecoder();

/** The NUL-terminated text of a header field. */
function field(header: Uint8Array, start: number, length: number): string {
  const bytes = header.subarray(start, start + length);
  const end = bytes.indexOf(0);
  return decoder.decode(end === -1 ? bytes : bytes.subarray(0, end));
}

function octal(header: Uint8Array, start: number, length: number): number {
  const text = field(header, start, length).trim();
  return text === "" ? 0 : Number.parseInt(text, 8);
}

/** Whether the name stays inside the directory it is unpacked into. */
function isSafeName(name: string): boolean {
  return (
    name !== "" &&
    !name.startsWith("/") &&
    !/^[A-Za-z]:/u.test(name) &&
    !name.split(/[/\\]/u).includes("..")
  );
}

/** The header at the offset: the entry's name, type and size; null at the archive's end. */
function headerAt(archive: Uint8Array, offset: number) {
  const header = archive.subarray(offset, offset + block);
  if (header.length < block || header.every((byte) => byte === 0)) {
    return null;
  }
  const prefix = field(header, 345, 155);
  const name = field(header, 0, 100);
  return {
    name: prefix === "" ? name : `${prefix}/${name}`,
    type: field(header, 156, 1),
    mode: octal(header, 100, 8),
    size: octal(header, 124, 12),
  };
}

/** The entry's content; throws when the archive ends before it. */
function contentAt(archive: Uint8Array, start: number, size: number): Uint8Array {
  if (start + size > archive.length) {
    throw new Error("The tar archive is truncated");
  }
  return archive.subarray(start, start + size);
}

/** The entry's file when it is a regular one; throws for a name that leaves its directory. */
function regularFile(
  entry: NonNullable<ReturnType<typeof headerAt>>,
  bytes: Uint8Array,
): TarFile | null {
  if (entry.type !== "0" && entry.type !== "") {
    return null;
  }
  if (!isSafeName(entry.name)) {
    throw new Error(`The tar archive has an unsafe name: ${entry.name}`);
  }
  return { name: entry.name, mode: entry.mode, bytes };
}

/**
 * The regular files of the archive in order; links, directories and extended headers are skipped.
 * Throws for a truncated archive or a name that leaves its directory.
 */
export function tarFiles(archive: Uint8Array): TarFile[] {
  const files: TarFile[] = [];
  let offset = 0;
  for (let entry = headerAt(archive, offset); entry !== null; entry = headerAt(archive, offset)) {
    const start = offset + block;
    const file = regularFile(entry, contentAt(archive, start, entry.size));
    if (file !== null) {
      files.push(file);
    }
    offset = start + Math.ceil(entry.size / block) * block;
  }
  return files;
}
