import nodemailer, { type Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'
import type { EmailConfig } from '../config.ts'
import type { Logger } from '../lib/log.ts'

/* Sending an email over SMTP, to whatever server the operator configured
   (their mail provider, a Gmail account, a relay of their own).

   send() never throws. Its callers answer users who must not learn whether an
   address exists, and must not fail because a mail server had a bad minute, so
   a problem is logged and reported as 'failed'. 'sent' means the SMTP server
   accepted the message, not that it was delivered. Addresses and message
   bodies (which will hold links with tokens) are never logged. */

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
}

export type SendResult = 'sent' | 'not_configured' | 'failed'

export interface Mailer {
  /** `kind` names the email in the logs, e.g. 'verify_email'. */
  send(kind: string, message: EmailMessage): Promise<SendResult>
}

const TIMEOUT_MS = 10_000

/** Never plain text: port 465 starts with TLS, any other port must upgrade
    with STARTTLS or the message is not sent. */
export function smtpOptions(config: EmailConfig): SMTPTransport.Options {
  const implicitTls = config.port === 465
  return {
    host: config.host,
    port: config.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  }
}

type SendMail = Pick<Transporter<SMTPTransport.SentMessageInfo>, 'sendMail'>

export function smtpMailer(
  config: EmailConfig,
  log: Logger,
  transport: SendMail = nodemailer.createTransport(smtpOptions(config)),
): Mailer {
  return {
    async send(kind, message) {
      try {
        const info = await transport.sendMail({
          from: { name: config.fromName, address: config.fromAddress },
          ...message,
        })
        log.info({ kind, messageId: info.messageId }, 'email.sent')
        return 'sent'
      } catch (error) {
        // Server replies can quote the recipient, so only the error code is logged.
        const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown'
        log.error({ kind, code }, 'email.failed')
        return 'failed'
      }
    },
  }
}

export interface SentEmail extends EmailMessage {
  kind: string
}

const MEMORY_LIMIT = 50

/** Keeps emails in memory instead of sending them, answering `result` for
    each: for tests, and for a server with email off. Holds the latest 50. */
export function memoryMailer(result: SendResult = 'sent'): Mailer & { sent: SentEmail[] } {
  const sent: SentEmail[] = []
  return {
    sent,
    send(kind, message) {
      sent.push({ kind, ...message })
      if (sent.length > MEMORY_LIMIT) sent.shift()
      return Promise.resolve(result)
    },
  }
}

export function createMailer(config: EmailConfig | null, log: Logger): Mailer {
  return config ? smtpMailer(config, log) : memoryMailer('not_configured')
}
