import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
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

// A date in YYYY-MM-DD, `days` from now.
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

async function openFromAccountMenu(page: Page, t: Translate, key: MessageKey) {
  await page.getByRole('button', { name: t('nav.accountMenu') }).click()
  await page.getByRole('menuitem', { name: t(key) }).click()
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

    // A payment plan, whose instalments go into the budget.
    await openFromAccountMenu(page, t, 'nav.plans')
    await page.getByRole('button', { name: t('plans.addFirst') }).click()
    const plan = page.getByRole('dialog', { name: t('plans.newTitle') })
    await plan.getByRole('textbox', { name: t('plans.name') }).fill('Frigider smoke')
    await plan.getByRole('textbox', { name: t('plans.totalAmount') }).fill('2000')
    await plan.getByRole('textbox', { name: t('plans.count') }).fill('3')
    await plan.getByRole('textbox', { name: t('budget.newCategory') }).fill('Electrocasnice')
    await plan.getByRole('button', { name: t('plans.create') }).click()
    await expect(plan).toBeHidden()
    await expect(page.getByText('Frigider smoke').first()).toBeVisible()

    // A reminder.
    await page.getByRole('link', { name: t('nav.reminders') }).click()
    await page.getByRole('button', { name: t('reminders.addFirst') }).click()
    const reminder = page.getByRole('dialog', { name: t('reminders.newTitle') })
    await reminder.getByRole('textbox', { name: t('reminders.name') }).fill('ITP smoke')
    await reminder.getByLabel(t('reminders.dueDate')).fill(daysFromNow(30))
    await reminder.getByRole('button', { name: t('reminders.create') }).click()
    await expect(reminder).toBeHidden()
    await expect(page.getByText('ITP smoke')).toBeVisible()

    // Food: the month's money, then a purchase.
    await page.getByRole('link', { name: t('nav.food') }).click()
    await page.getByRole('button', { name: t('food.setBudget') }).click()
    const sources = page.getByRole('dialog')
    await sources.getByRole('textbox', { name: t('food.sourceName', { number: 1 }) }).fill('Card')
    await sources.getByRole('textbox', { name: t('food.sourceAmount', { number: 1 }) }).fill('1500')
    await sources.getByRole('button', { name: t('common.save'), exact: true }).click()
    await expect(sources).toBeHidden()

    await page.getByRole('button', { name: t('food.addPurchase') }).first().click()
    const purchase = page.getByRole('dialog', { name: t('food.newPurchase') })
    await purchase.getByRole('textbox', { name: t('food.amount') }).fill('123,45')
    await purchase.getByText(t('food.otherStore'), { exact: true }).click()
    await purchase.getByRole('textbox', { name: t('food.storeName') }).fill('Piața smoke')
    await purchase.getByRole('button', { name: t('food.add'), exact: true }).click()
    await expect(purchase).toBeHidden()
    await expect(page.getByText('Piața smoke').first()).toBeVisible()

    // Export: signing in does not count as confirming the password, so it is asked.
    await openFromAccountMenu(page, t, 'nav.settings')
    await page.getByRole('button', { name: t('settings.exportButton') }).click()
    const exportStepUp = page.getByRole('dialog', { name: t('settings.confirmTitle') })
    await exportStepUp.getByLabel(t('auth.password'), { exact: true }).fill(PASSWORD)
    const downloading = page.waitForEvent('download')
    await exportStepUp.getByRole('button', { name: t('settings.confirm') }).click()
    const download = await downloading
    const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as Record<string, unknown>
    expect(exported.format).toBe('adun-export')
    expect(JSON.stringify(exported)).toContain('Piața smoke')
    await expect(page.getByText(t('settings.exported'))).toBeVisible()

    // Delete the account: the word first, then the password again, since one
    // confirmation allows one action.
    await page.getByRole('button', { name: t('settings.deleteAccount') }).click()
    const deletion = page.getByRole('dialog', { name: t('settings.deleteAccount') })
    await deletion.getByRole('textbox').fill(t('settings.deleteWord'))
    await deletion.getByRole('button', { name: t('settings.deleteForever') }).click()
    const deleteStepUp = page.getByRole('dialog', { name: t('settings.confirmTitle') })
    await deleteStepUp.getByLabel(t('auth.password'), { exact: true }).fill(PASSWORD)
    await deleteStepUp.getByRole('button', { name: t('settings.confirm') }).click()

    // Signed out, and the account is gone.
    await expect(page.getByRole('heading', { name: t('auth.signInTitle') })).toBeVisible()
    await page.getByLabel(t('auth.email')).fill(email)
    await page.getByLabel(t('auth.password'), { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: t('auth.signIn') }).click()
    await expect(page.getByText(t('error.invalid_credentials'))).toBeVisible()

    expect(problems, 'blocked by the CSP or thrown in the page').toEqual([])
  })
}
