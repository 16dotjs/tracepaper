const inFlightRequests = new Map<string, Promise<unknown>>();

export async function dedupeInFlight<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
}
