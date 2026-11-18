import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no matchMedia. This stand-in matches no query (a light colour
// scheme); real browsers use their own.
window.matchMedia = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.className = ''
})
