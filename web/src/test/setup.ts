import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

/* jsdom lacks a few browser features the app uses. These stand-ins do only
   what the tests rely on; real browsers use their own. */

// <dialog>: showModal() opens, close() closes and fires `close`.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '')
}
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return
  this.removeAttribute('open')
  this.dispatchEvent(new Event('close'))
}

// Element.scrollTo: does nothing (the month strip centres its selected month).
Element.prototype.scrollTo = () => undefined

// matchMedia: no media query matches (a light colour scheme).
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
