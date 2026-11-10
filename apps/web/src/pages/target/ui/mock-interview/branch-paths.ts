/** A shared vertical trunk avoids overlapping curves when a question has several branches. */
export function branchPaths(width: number, start: number, entries: readonly number[]) {
  const trunk = width / 2;
  const high = Math.max(start, ...entries),
    low = Math.min(start, ...entries);
  const radius = Math.min(
    10,
    ...entries.filter((entry) => entry !== start).map((entry) => Math.abs(entry - start) / 2),
  );
  let root = `M0 ${start} H${trunk}`;
  if (low !== high && (start === low || start === high)) {
    const direction = start === low ? 1 : -1;
    root = `M0 ${start} H${trunk - radius} Q${trunk} ${start} ${trunk} ${start + direction * radius}`;
  }
  const lines = low === high ? [root] : [root, `M${trunk} ${low + radius} V${high - radius}`];
  const paths = entries.map((entry) => {
    if (entry === start) {
      return `M${trunk} ${entry} H${width - 1}`;
    }
    const direction = entry < start ? 1 : -1;
    return `M${trunk} ${entry + direction * radius} Q${trunk} ${entry} ${trunk + radius} ${entry} H${width - 1}`;
  });
  return { lines, paths };
}
