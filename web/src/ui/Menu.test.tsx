import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { Menu } from './Menu.tsx'

function setup() {
  const selected = vi.fn()
  render(
    <>
      <Menu
        label="Account"
        trigger="AP"
        items={[
          { label: 'Privacy', onSelect: () => { selected('privacy') } },
          { label: 'Everywhere', onSelect: () => { selected('everywhere') } },
          'separator',
          { label: 'Sign out', tone: 'danger', onSelect: () => { selected('sign-out') } },
        ]}
      />
      <button type="button">Elsewhere</button>
    </>,
  )
  const trigger = screen.getByRole('button', { name: 'Account' })
  return { selected, trigger }
}

const focusedName = () => document.activeElement?.textContent

describe('Menu', () => {
  test('is closed until opened; the trigger reports its state', async () => {
    const { trigger } = setup()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(trigger)
    expect(screen.getByRole('menu', { name: 'Account' })).toBeDefined()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(focusedName()).toBe('Privacy')
  })

  test('Enter, Space and ArrowDown open on the first item; ArrowUp on the last', async () => {
    const { trigger } = setup()
    for (const key of ['{Enter}', ' ', '{ArrowDown}']) {
      trigger.focus()
      await userEvent.keyboard(key)
      expect(focusedName()).toBe('Privacy')
      await userEvent.keyboard('{Escape}')
    }
    trigger.focus()
    await userEvent.keyboard('{ArrowUp}')
    expect(focusedName()).toBe('Sign out')
  })

  test('arrows move and wrap, Home and End jump, separators are skipped', async () => {
    const { trigger } = setup()
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(focusedName()).toBe('Everywhere')
    await userEvent.keyboard('{ArrowDown}')
    expect(focusedName()).toBe('Sign out')
    await userEvent.keyboard('{ArrowDown}')
    expect(focusedName()).toBe('Privacy')
    await userEvent.keyboard('{ArrowUp}')
    expect(focusedName()).toBe('Sign out')
    await userEvent.keyboard('{Home}')
    expect(focusedName()).toBe('Privacy')
    await userEvent.keyboard('{End}')
    expect(focusedName()).toBe('Sign out')
  })

  test('Enter chooses the focused item, closes, and returns focus to the trigger', async () => {
    const { trigger, selected } = setup()
    trigger.focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(selected).toHaveBeenCalledExactlyOnceWith('everywhere')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  test('Escape closes and returns focus to the trigger without choosing', async () => {
    const { trigger, selected } = setup()
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(selected).not.toHaveBeenCalled()
  })

  test('Tab and a click outside close it', async () => {
    const { trigger } = setup()
    await userEvent.click(trigger)
    await userEvent.tab()
    expect(screen.queryByRole('menu')).toBeNull()

    await userEvent.click(trigger)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
