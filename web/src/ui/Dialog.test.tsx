import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { I18nProvider } from '../lib/i18n.tsx'
import { Dialog } from './Dialog.tsx'

function open() {
  render(
    <I18nProvider>
      <Dialog open title="New entry" onClose={() => undefined}>
        <input aria-label="Amount" />
      </Dialog>
    </I18nProvider>,
  )
}

// Only the coarse-pointer query matches, as on a phone.
function useTouchScreen() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: query === '(pointer: coarse)', media: query }) as MediaQueryList,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Dialog', () => {
  test('focuses its first field with a mouse and keyboard', () => {
    open()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Amount' }))
  })

  test('takes focus itself on a touch screen, so no keyboard opens', () => {
    useTouchScreen()
    open()
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'New entry' }))
  })
})
