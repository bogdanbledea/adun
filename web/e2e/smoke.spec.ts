import { expect, test } from '@playwright/test'
import { en } from '../src/i18n/en.ts'
import { ro, type MessageKey } from '../src/i18n/ro.ts'

/* One new account goes through every area of the built app. The labels come
   from the app's own dictionaries, so the same tour runs in Romanian and in
   English. */

type Language = 'ro' | 'en'
type Translate = (key: MessageKey, params?: Record<string, string | number>) => string
const dictionaries = { ro, en }

function translator(language: Language): Translate {
  return (key, params = {}) =>
    dictionaries[language][key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

const PASSWORD = 'Smoke-test-pass-1!'

for (const language of ['ro', 'en'] as const) {
  test(`a tour of the app in ${language === 'ro' ? 'Romanian' : 'English'}`, async ({ page }) => {
    const t = translator(language)
    const email = `smoke-${language}-${String(Date.now())}@example.test`

    // Anything the CSP blocks, or any uncaught error, is a bug in the build or
    // the app, never noise.
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.text().includes('Content Security Policy')) problems.push(message.text().slice(0, 200))
    })
    page.on('pageerror', (error) => problems.push(error.message.slice(0, 200)))

    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro')
    if (language === 'en') {
      await page.getByRole('button', { name: ro['language.switch'] }).click()
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    }

    // Register: with email off, the account works at once.
    await page.getByRole('button', { name: t('auth.register') }).click()
    await page.getByLabel(t('auth.name')).fill('Smoke')
    await page.getByLabel(t('auth.email')).fill(email)
    await page.getByLabel(t('auth.newPassword')).fill(PASSWORD)
    await page.getByLabel(t('auth.confirmPassword')).fill(PASSWORD)
    await page.getByRole('button', { name: t('auth.createAccount') }).click()
    await expect(page.getByText(t('auth.accountReady'))).toBeVisible()

    await page.getByLabel(t('auth.email')).fill(email)
    await page.getByLabel(t('auth.password'), { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: t('auth.signIn') }).click()
    await expect(page).toHaveURL(/\/buget\/\d{2}-\d{2}$/)

    // Budget: start this month empty and note an income.
    await page.getByRole('button', { name: t('budget.createEmpty') }).click()
    await page.getByRole('button', { name: t('budget.addTransaction') }).click()
    const entry = page.getByRole('dialog', { name: t('budget.addTitle') })
    await entry.getByRole('combobox', { name: t('budget.type') }).selectOption('income')
    await entry.getByRole('textbox', { name: t('budget.amount'), exact: true }).fill('5000')
    await entry.getByRole('textbox', { name: t('budget.description') }).fill('Salariu smoke')
    await entry.getByRole('textbox', { name: t('budget.category'), exact: true }).fill('Venituri')
    await entry.getByRole('button', { name: t('common.save'), exact: true }).click()
    await expect(entry).toBeHidden()
    await expect(page.getByText('Salariu smoke')).toBeVisible()

    expect(problems, 'blocked by the CSP or thrown in the page').toEqual([])
  })
}
