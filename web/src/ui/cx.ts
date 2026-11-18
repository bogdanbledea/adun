/** Joins class names, skipping the ones switched off by a condition. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}
