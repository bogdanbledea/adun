import { loadConfig } from '../config.ts'
import { smtpMailer } from '../email/mailer.ts'
import { createLogger } from '../lib/log.ts'

// npm run send-test-email -- <address> — sends one short email with the
// configured SMTP settings, to check them before anyone needs a real email.

const to = process.argv[2]
if (!to) {
  console.error('Usage: npm run send-test-email -- <address>')
  process.exit(1)
}

const config = loadConfig(process.env)
if (!config.email) {
  console.error('Email is off: set SMTP_HOST and EMAIL_FROM (see the README).')
  process.exit(1)
}

const mailer = smtpMailer(config.email, createLogger(config.logLevel))
const result = await mailer.send('test', {
  to,
  subject: 'adun: test email',
  text: 'If you can read this, the server can send email.',
  html: '<p>If you can read this, the server can send email.</p>',
})
console.log(result === 'sent' ? `Sent to ${to}.` : 'Not sent; the log line above has the reason.')
process.exit(result === 'sent' ? 0 : 1)
