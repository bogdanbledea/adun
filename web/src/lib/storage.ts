/* localStorage holds only display preferences, such as the theme. It can be
   unavailable (private mode, blocked site data) and the app must still work,
   so every access is guarded. */

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Not remembered; the in-memory choice still applies for this visit.
  }
}
