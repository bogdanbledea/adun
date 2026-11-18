import type { MessageKey } from './i18n.tsx'

/* The server's password rules (server/src/features/auth/password.ts), checked
   before sending so the form can say what is wrong in the user's language. */

export function passwordProblem(password: string): MessageKey | null {
  if (password.length < 12) return 'auth.passwordTooShort'
  if (password.length > 200) return 'auth.passwordTooLong'
  const varied = /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password)
  return varied ? null : 'auth.passwordTooSimple'
}
