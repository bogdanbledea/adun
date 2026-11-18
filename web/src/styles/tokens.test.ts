import { expect, test } from 'vitest'
import css from './tokens.css?raw'

// The dark palette is written twice in tokens.css (system preference and the
// explicit .dark class); the two copies must stay identical.
test('both copies of the dark palette are the same', () => {
  const declarations = (opening: string) => {
    const start = css.indexOf(opening) + opening.length
    return css
      .slice(start, css.indexOf('}', start))
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }
  const system = declarations('\n  :root:not(.light) {')
  const explicit = declarations('\n.dark {')
  expect(system.length).toBeGreaterThan(10)
  expect(explicit).toEqual(system)
})
