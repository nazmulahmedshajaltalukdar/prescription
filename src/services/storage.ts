export function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
    return globalThis.localStorage as Storage
  }

  return null
}

export function readJson<T>(key: string, fallback: T): T {
  const storage = getStorage()
  if (!storage) return fallback

  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson<T>(key: string, value: T) {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(key, JSON.stringify(value))
}
