import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { App } from './App.tsx'
import { renderWithProviders } from './test/render.tsx'

test('the root opens the budget, with its tab marked as current', () => {
  renderWithProviders(<App />, { path: '/' })
  expect(screen.getByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
  expect(screen.getByRole('link', { name: 'Buget' }).getAttribute('aria-current')).toBe('page')
})

test('the tabs move between sections', async () => {
  renderWithProviders(<App />, { path: '/buget' })
  await userEvent.click(screen.getByRole('link', { name: 'Mâncare' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Mâncare' })).toBeDefined()
  await userEvent.click(screen.getByRole('link', { name: 'Scadențe' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Scadențe' })).toBeDefined()
})

test('the shell switches language and theme', async () => {
  renderWithProviders(<App />, { path: '/buget' })

  await userEvent.click(screen.getByRole('button', { name: 'Switch to English' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeDefined()

  await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }))
  expect(document.documentElement.classList.contains('dark')).toBe(true)
  expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeDefined()
})

test('an unknown address shows a page not found with a way back', async () => {
  renderWithProviders(<App />, { path: '/nicaieri' })
  expect(screen.getByRole('heading', { name: 'Pagina nu există' })).toBeDefined()
  await userEvent.click(screen.getByRole('link', { name: 'Înapoi la buget' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Buget' })).toBeDefined()
})
