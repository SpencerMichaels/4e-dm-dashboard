const pending = new Map<string, Promise<unknown>>()

/** Serialize in-process writes to the same entity, including authoring imports. */
export function withWriteLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  const previous = pending.get(path) ?? Promise.resolve()
  const next = previous.then(run, run)
  pending.set(path, next)
  void next.finally(() => { if (pending.get(path) === next) pending.delete(path) }).catch(() => {})
  return next
}
