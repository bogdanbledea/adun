import type { MessageKey } from './ro.ts'

export const en: Record<MessageKey, string> = {
  'language.switch': 'Schimbă în română',
  'language.short': 'RO',
  'theme.toDark': 'Switch to dark theme',
  'theme.toLight': 'Switch to light theme',

  'brand.home': 'adun — home',
  'brand.mottoPrefix': 'I gather',
  'nav.sections': 'Sections',
  'nav.budget': 'Budget',
  'nav.food': 'Food',
  'nav.reminders': 'Due dates',
  'footer.copyright': '© {year} adun',

  'budget.subtitle': 'What comes in, what goes out and what is left, month by month.',
  'food.subtitle': 'How much you have, how fast you are spending it, and what you bought.',
  'reminders.subtitle': 'Car inspection, insurance, road tax and checks, in the order they come.',

  'page.notFoundTitle': 'Page not found',
  'page.notFoundText': 'This address does not lead anywhere in the app.',
  'page.backToBudget': 'Back to the budget',

  'error.invalid_credentials': 'Wrong email or password.',
  'error.registrations_disabled': 'New sign-ups are turned off.',
  'error.weak_password': 'The password must be 12–200 characters long, with lower and upper case letters, a digit and a symbol.',
  'error.network_error': 'The server is not responding. Check your connection and try again.',
  'error.unauthorized': 'Your session has expired. Sign in again.',
  'error.forbidden': 'You do not have access to this action.',
  'error.not_found': 'Not found.',
  'error.invalid_input': 'The data sent is not valid.',
  'error.rate_limited': 'Too many requests. Try again later.',
  'error.payload_too_large': 'The request is too large.',
  'error.internal_error': 'An unexpected error occurred.',
  'error.unknown': 'Something went wrong. Try again.',
}

export const enMottos = ['the family’s money', 'monthly peace of mind', 'what matters', 'money, not worries', 'today for tomorrow']
