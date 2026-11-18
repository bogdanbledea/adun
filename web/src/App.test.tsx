import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from './App.tsx'
import { ThemeProvider } from './lib/theme.tsx'

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  )
}

function serverAnswers(status: number) {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json({}, { status })))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

test('says the server is up when /health answers', async () => {
  const fetchMock = serverAnswers(200)
  renderApp()

  expect(screen.getByRole('status').textContent).toBe('Checking the server…')
  expect(await screen.findByText('The server is up.')).toBeDefined()
  expect(fetchMock).toHaveBeenCalledWith('/health', expect.anything())
})

test('says the server cannot be reached when /health fails', async () => {
  serverAnswers(503)
  renderApp()
  expect(await screen.findByText('The server cannot be reached.')).toBeDefined()
})

test('says the server cannot be reached when the request fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
  renderApp()
  expect(await screen.findByText('The server cannot be reached.')).toBeDefined()
})

test('switches between the light and dark theme', async () => {
  serverAnswers(200)
  renderApp()

  await userEvent.click(screen.getByRole('button', { name: 'Use the dark theme' }))
  expect(document.documentElement.classList.contains('dark')).toBe(true)

  await userEvent.click(screen.getByRole('button', { name: 'Use the light theme' }))
  expect(document.documentElement.classList.contains('light')).toBe(true)
})
