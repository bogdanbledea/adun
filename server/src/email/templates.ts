import type { ReminderKind } from '../features/reminders/repository.ts'

/* The emails the app sends, in Romanian and English, as plain text and simple
   HTML. Each is a greeting, a few paragraphs, one button and what follows it;
   the HTML uses inline styles only, since mail clients drop stylesheets. */

export type Language = 'ro' | 'en'

export interface RenderedEmail {
  subject: string
  text: string
  html: string
}

const FIRST_NAME_MAX = 40

/* Emails greet by first name; the account only stores a display name.
   Whoever registers chooses it, and the confirmation email goes to an address
   that may not be theirs, so only letters, apostrophes and hyphens are kept:
   no link, address or markup can ride along in an email from this server. */
export function firstNameOf(displayName: string): string {
  const word = displayName.trim().split(/\s+/)[0] ?? ''
  return word.replace(/[^\p{L}\p{M}'’-]/gu, '').slice(0, FIRST_NAME_MAX)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

interface Layout {
  language: Language
  subject: string
  greeting: string
  before: string[]
  button: { label: string; url: string }
  after: string[]
}

const COPY_LINK: Record<Language, string> = {
  ro: 'Dacă butonul nu merge, copiază linkul în browser:',
  en: 'If the button does not work, copy the link into your browser:',
}

function render({ language, subject, greeting, before, button, after }: Layout): RenderedEmail {
  const text = [greeting, ...before, `${button.label}: ${button.url}`, ...after].join('\n\n')

  const paragraph = (content: string) => `<p style="margin:0 0 16px">${escapeHtml(content)}</p>`
  const url = escapeHtml(button.url)
  const html = `<!doctype html>
<html lang="${language}">
<body style="margin:0;padding:24px;background:#f7f8f4;color:#1d2521;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;font-size:16px;line-height:1.5">
<div style="max-width:480px;margin:0 auto;padding:24px;background:#fbfcf8;border:1px solid #d6e0d9;border-radius:12px">
<p style="margin:0 0 20px;font-weight:700;color:#237450">adun</p>
${[greeting, ...before].map(paragraph).join('\n')}
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:10px 18px;background:#237450;color:#ffffff;border-radius:8px;font-weight:600;text-decoration:none">${escapeHtml(button.label)}</a></p>
${after.map(paragraph).join('\n')}
<p style="margin:24px 0 0;font-size:13px;color:#52625a">${escapeHtml(COPY_LINK[language])}<br><a href="${url}" style="color:#237450;word-break:break-all">${url}</a></p>
</div>
</body>
</html>`

  return { subject, text, html }
}

function greet(language: Language, displayName: string): string {
  const name = firstNameOf(displayName)
  if (language === 'en') return name ? `Hi ${name},` : 'Hi,'
  return name ? `Bună, ${name},` : 'Bună,'
}

/* The link lifetimes written below (24 hours, one hour) must match the ones
   the links are issued with. */

export function verifyEmail(language: Language, { displayName, url }: { displayName: string; url: string }): RenderedEmail {
  if (language === 'en') {
    return render({
      language,
      subject: 'Confirm your email address',
      greeting: greet(language, displayName),
      before: ['Confirm this address to start using your adun account.'],
      button: { label: 'Confirm the address', url },
      after: ['The link works for 24 hours. If you did not create this account, ignore this email.'],
    })
  }
  return render({
    language,
    subject: 'Confirmă adresa de email',
    greeting: greet(language, displayName),
    before: ['Confirmă adresa ca să începi să folosești contul adun.'],
    button: { label: 'Confirmă adresa', url },
    after: ['Linkul funcționează 24 de ore. Dacă nu tu ai creat contul, ignoră acest email.'],
  })
}

export function passwordReset(language: Language, { displayName, url }: { displayName: string; url: string }): RenderedEmail {
  if (language === 'en') {
    return render({
      language,
      subject: 'A new password for adun',
      greeting: greet(language, displayName),
      before: ['Someone, hopefully you, asked for a new password for your adun account.'],
      button: { label: 'Choose a new password', url },
      after: ['The link works for one hour. If you did not ask for it, ignore this email: your password stays the same.'],
    })
  }
  return render({
    language,
    subject: 'Parolă nouă pentru adun',
    greeting: greet(language, displayName),
    before: ['Cineva, sperăm că tu, a cerut o parolă nouă pentru contul tău adun.'],
    button: { label: 'Alege o parolă nouă', url },
    after: ['Linkul funcționează o oră. Dacă nu tu l-ai cerut, ignoră acest email: parola rămâne aceeași.'],
  })
}

/** Sent instead of a confirmation when someone registers an address that
    already has an account, so the answer to the registration can stay the
    same whether or not the address was taken. */
export function accountExists(
  language: Language,
  { displayName, signInUrl, resetUrl }: { displayName: string; signInUrl: string; resetUrl: string },
): RenderedEmail {
  if (language === 'en') {
    return render({
      language,
      subject: 'You already have an adun account',
      greeting: greet(language, displayName),
      before: [
        'Someone tried to create a new adun account with this address, but it already has one.',
        'If that was you, sign in with your password.',
      ],
      button: { label: 'Sign in', url: signInUrl },
      after: [
        `Forgot the password? Ask for a new one: ${resetUrl}`,
        'If it was not you, there is nothing to do: no new account was created.',
      ],
    })
  }
  return render({
    language,
    subject: 'Ai deja un cont adun',
    greeting: greet(language, displayName),
    before: [
      'Cineva a încercat să creeze un cont adun nou cu această adresă, dar ea are deja unul.',
      'Dacă ai fost tu, intră în cont cu parola ta.',
    ],
    button: { label: 'Intră în cont', url: signInUrl },
    after: [
      `Ai uitat parola? Cere una nouă: ${resetUrl}`,
      'Dacă nu ai fost tu, nu trebuie să faci nimic: nu s-a creat niciun cont nou.',
    ],
  })
}

/** Sent after the password is changed from the settings, so the owner learns
    of a change they did not make while there is still time to undo it. */
export function passwordChanged(
  language: Language,
  { displayName, resetUrl }: { displayName: string; resetUrl: string },
): RenderedEmail {
  if (language === 'en') {
    return render({
      language,
      subject: 'Your adun password was changed',
      greeting: greet(language, displayName),
      before: [
        'The password of your adun account was just changed, and every other device was signed out.',
        'If it was you, there is nothing to do. If not, ask for a new password now: the link comes to this address.',
      ],
      button: { label: 'Ask for a new password', url: resetUrl },
      after: [],
    })
  }
  return render({
    language,
    subject: 'Parola adun a fost schimbată',
    greeting: greet(language, displayName),
    before: [
      'Parola contului tău adun tocmai a fost schimbată, iar celelalte dispozitive au fost deconectate.',
      'Dacă ai fost tu, nu trebuie să faci nimic. Dacă nu, cere acum o parolă nouă: linkul vine pe această adresă.',
    ],
    button: { label: 'Cere o parolă nouă', url: resetUrl },
    after: [],
  })
}

// "Other" says nothing in an email, so it is left out.
const KIND_LABELS: Record<Language, Record<ReminderKind, string | null>> = {
  ro: { itp: 'ITP', rca: 'RCA', casco: 'CASCO', rovinieta: 'Rovinietă', revizie_gaz: 'Revizie gaze', extinctor: 'Extinctor', altele: null },
  en: { itp: 'ITP', rca: 'RCA', casco: 'CASCO', rovinieta: 'Road tax', revizie_gaz: 'Gas check', extinctor: 'Extinguisher', altele: null },
}

const DATE_LOCALES: Record<Language, string> = { ro: 'ro-RO', en: 'en-GB' }

// "1 December 2026", from a YYYY-MM-DD day.
function longDate(language: Language, date: string): string {
  const format = new Intl.DateTimeFormat(DATE_LOCALES[language], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return format.format(new Date(`${date}T00:00:00Z`))
}

// Romanian puts "de" after 20 and up, unless the number ends in 01–19:
// "7 zile", "30 de zile", "101 zile".
function zile(days: number): string {
  const rest = days % 100
  return rest === 0 || rest >= 20 ? `${String(days)} de zile` : `${String(days)} zile`
}

function countdown(language: Language, days: number): string {
  if (language === 'en') return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${String(days)} days`
  return days <= 0 ? 'azi' : days === 1 ? 'mâine' : `în ${zile(days)}`
}

export interface ReminderDue {
  displayName: string
  name: string
  kind: ReminderKind
  subject: string | null
  dueDate: string
  daysLeft: number
  url: string
}

/** Sent by the hourly sweep as a due date comes near. */
export function reminderDue(language: Language, reminder: ReminderDue): RenderedEmail {
  const detail = [KIND_LABELS[language][reminder.kind], reminder.subject].filter(Boolean).join(' · ')
  const what = detail ? `${reminder.name} (${detail})` : reminder.name
  const date = longDate(language, reminder.dueDate)
  const when = countdown(language, reminder.daysLeft)
  if (language === 'en') {
    return render({
      language,
      subject: `${reminder.name} is due ${when}`,
      greeting: greet(language, reminder.displayName),
      before: [
        `${what} is due on ${date}, ${when}.`,
        'Once it is renewed, press “I renewed” next to it in adun, so the due date moves on.',
      ],
      button: { label: 'See your due dates', url: reminder.url },
      after: ['You can change when these emails come, or turn them off, from the due date in adun.'],
    })
  }
  return render({
    language,
    subject: `${reminder.name} expiră ${when}`,
    greeting: greet(language, reminder.displayName),
    before: [
      `${what} expiră pe ${date}, ${when}.`,
      'După ce o reînnoiești, apasă „Am reînnoit” lângă ea în adun, ca scadența să treacă mai departe.',
    ],
    button: { label: 'Vezi scadențele', url: reminder.url },
    after: ['Poți schimba când vin aceste emailuri, sau le poți opri, din scadența respectivă în adun.'],
  })
}
