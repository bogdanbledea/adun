import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { captureLogger } from '../../test/helpers.ts'
import type { EmailConfig } from '../config.ts'
import { memoryMailer, smtpMailer, smtpOptions } from './mailer.ts'

const config: EmailConfig = {
  host: 'smtp.example.com',
  port: 587,
  user: 'adun',
  password: 'secret',
  fromAddress: 'adun@example.com',
  fromName: 'adun',
}

const message = {
  to: 'ana@example.com',
  subject: 'Confirm your address',
  text: 'Open https://adun.example.com/#token=abc',
  html: '<p>Open the link</p>',
}

describe('smtpOptions', () => {
  test('port 465 starts with TLS; any other port must upgrade with STARTTLS', () => {
    assert.deepEqual(
      { secure: smtpOptions({ ...config, port: 465 }).secure, requireTLS: smtpOptions({ ...config, port: 465 }).requireTLS },
      { secure: true, requireTLS: false },
    )
    assert.deepEqual(
      { secure: smtpOptions(config).secure, requireTLS: smtpOptions(config).requireTLS },
      { secure: false, requireTLS: true },
    )
  })

  test('signs in only when a user is configured', () => {
    assert.deepEqual(smtpOptions(config).auth, { user: 'adun', pass: 'secret' })
    assert.equal(smtpOptions({ ...config, user: null, password: null }).auth, undefined)
  })
})

describe('smtpMailer', () => {
  test('sends from the configured sender and logs the message ID, not the address', async () => {
    const { log, lines } = captureLogger()
    const sent: unknown[] = []
    const mailer = smtpMailer(config, log, {
      sendMail: (mail) => {
        sent.push(mail)
        return Promise.resolve({ messageId: '<m1@example.com>' } as never)
      },
    })

    assert.equal(await mailer.send('verify_email', message), 'sent')
    assert.deepEqual(sent, [{ from: { name: 'adun', address: 'adun@example.com' }, ...message }])
    const line = lines.find((entry) => entry.msg === 'email.sent')
    assert.equal(line?.kind, 'verify_email')
    assert.equal(line.messageId, '<m1@example.com>')
    assert.doesNotMatch(JSON.stringify(lines), /ana@example\.com|token=/)
  })

  test('a failure is reported, not thrown, and only its code is logged', async () => {
    const { log, lines } = captureLogger()
    const mailer = smtpMailer(config, log, {
      sendMail: () => Promise.reject(Object.assign(new Error('550 ana@example.com unknown'), { code: 'EENVELOPE' })),
    })

    assert.equal(await mailer.send('verify_email', message), 'failed')
    const line = lines.find((entry) => entry.msg === 'email.failed')
    assert.equal(line?.code, 'EENVELOPE')
    assert.doesNotMatch(JSON.stringify(lines), /ana@example\.com/)
  })
})

test('memoryMailer keeps what would have been sent', async () => {
  const mailer = memoryMailer('not_configured')
  assert.equal(await mailer.send('verify_email', message), 'not_configured')
  assert.deepEqual(mailer.sent, [{ kind: 'verify_email', ...message }])
})
