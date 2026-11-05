/** Safe JSON read/write for mock console persistence (localStorage / sessionStorage). */

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

export function writeJsonStorage(storage: Storage, key: string, value: unknown) {
  storage.setItem(key, JSON.stringify(value));
}

export function removeStorage(storage: Storage, key: string) {
  storage.removeItem(key);
}
