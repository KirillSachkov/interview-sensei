export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((deliver) => {
    resolve = deliver;
  });
  return { promise, resolve };
}
