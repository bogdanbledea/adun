import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { usePrivacy } from '../lib/privacy.tsx'
import { renderWithProviders } from '../test/render.tsx'
import { Money } from './Money.tsx'

function Probe() {
  const { toggleAmounts } = usePrivacy()
  return (
    <>
      <p data-testid="amount">
        <Money bani={-150050} signed />
      </p>
      <button type="button" onClick={toggleAmounts}>
        toggle
      </button>
    </>
  )
}

test('shows the amount with its sign and unit', () => {
  renderWithProviders(<Probe />)
  expect(screen.getByTestId('amount').textContent).toBe('−1.500,50lei')
  expect(document.querySelector('.amount-masked')).toBeNull()
})

test('hidden amounts are blurred, read out as hidden, and remembered on this device', async () => {
  renderWithProviders(<Probe />)
  await userEvent.click(screen.getByRole('button', { name: 'toggle' }))

  const masked = document.querySelector('.amount-masked')
  expect(masked?.textContent).toBe('−1.500,50')
  expect(masked?.getAttribute('aria-hidden')).toBe('true')
  expect(screen.getByText('sumă ascunsă').className).toBe('sr-only')
  expect(localStorage.getItem('amountsHidden')).toBe('true')

  await userEvent.click(screen.getByRole('button', { name: 'toggle' }))
  expect(document.querySelector('.amount-masked')).toBeNull()
  expect(screen.queryByText('sumă ascunsă')).toBeNull()
  expect(localStorage.getItem('amountsHidden')).toBeNull()
})

test('a visit starts with amounts hidden when that was the last choice', () => {
  localStorage.setItem('amountsHidden', 'true')
  renderWithProviders(<Probe />)
  expect(document.querySelector('.amount-masked')).not.toBeNull()
})

test('can leave out the unit', () => {
  renderWithProviders(
    <p data-testid="bare">
      <Money bani={150000} bare />
    </p>,
  )
  expect(screen.getByTestId('bare').textContent).toBe('1.500')
})
