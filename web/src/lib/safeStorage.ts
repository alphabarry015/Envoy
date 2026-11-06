/** Safe JSON read/write for browser storage. */

export function readJsonStorage<T>(
  storage: Storage,
  key: string,
  validate: (value: unknown) => value is T,
): T | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Drop nulls and primitives so a corrupt array cannot crash a reader. */
export function storedObjects<T>(items: T[]): T[] {
  return items.filter((item) => item !== null && typeof item === "object");
}

export function writeJsonStorage(storage: Storage, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(storage: Storage, key: string) {
  storage.removeItem(key);
}
