import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { ThemeProvider, useTheme } from './theme.tsx'

function Probe() {
  const { theme, preference, toggleTheme, setPreference } = useTheme()
  return (
    <>
      <p>
        {preference}/{theme}
      </p>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
      <button type="button" onClick={() => { setPreference('system') }}>
        system
      </button>
    </>
  )
}

test('follows the system until a choice is made; the choice is a class on <html> and remembered', async () => {
  render(<ThemeProvider><Probe /></ThemeProvider>)
  const root = document.documentElement
  expect(screen.getByText('system/light')).toBeDefined()
  expect(root.className).toBe('')

  await userEvent.click(screen.getByRole('button', { name: 'toggle' }))
  expect(screen.getByText('dark/dark')).toBeDefined()
  expect(root.classList.contains('dark')).toBe(true)
  expect(localStorage.getItem('theme')).toBe('dark')
  expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1)

  await userEvent.click(screen.getByRole('button', { name: 'toggle' }))
  expect(root.classList.contains('light')).toBe(true)
  expect(root.classList.contains('dark')).toBe(false)

  await userEvent.click(screen.getByRole('button', { name: 'system' }))
  expect(root.className).toBe('')
  expect(localStorage.getItem('theme')).toBeNull()
})

test('starts from a remembered choice', () => {
  localStorage.setItem('theme', 'dark')
  render(<ThemeProvider><Probe /></ThemeProvider>)
  expect(screen.getByText('dark/dark')).toBeDefined()
  expect(document.documentElement.classList.contains('dark')).toBe(true)
})
