const flushers = new Set<() => Promise<void>>();
export function registerPreparationFlush(flush: () => Promise<void>) {
  flushers.add(flush);
  return () => flushers.delete(flush);
}
export async function flushPreparations() {
  await Promise.all(Array.from(flushers, (flush) => flush()));
}
