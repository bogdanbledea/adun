import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from './App.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('says the server is up when /health answers', async () => {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json({ status: 'ok' })))
  vi.stubGlobal('fetch', fetchMock)
  render(<App />)

  expect(screen.getByRole('status').textContent).toBe('Checking the server…')
  expect(await screen.findByText('The server is up.')).toBeDefined()
  expect(fetchMock).toHaveBeenCalledWith('/health', expect.anything())
})

test('says the server cannot be reached when /health fails', async () => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(Response.json({ status: 'unavailable' }, { status: 503 }))))
  render(<App />)
  expect(await screen.findByText('The server cannot be reached.')).toBeDefined()
})

test('says the server cannot be reached when the request fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))
  render(<App />)
  expect(await screen.findByText('The server cannot be reached.')).toBeDefined()
})
