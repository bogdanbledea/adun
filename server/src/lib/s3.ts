import crypto from 'node:crypto'

/* The two calls the backups need from an S3-compatible store (Cloudflare R2,
   Backblaze B2, MinIO, AWS), signed with AWS Signature Version 4. Path-style
   URLs, endpoint/bucket/key, since every one of them accepts those. The body's
   SHA-256 is part of the signature, so the store refuses a copy that arrives
   changed. */

export interface S3Target {
  // Origin of the S3 API, such as https://<account>.r2.cloudflarestorage.com.
  endpoint: string
  // auto for R2.
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export class S3Error extends Error {
  override name = 'S3Error'
}

const PUT_TIMEOUT_MS = 10 * 60 * 1000
const HEAD_TIMEOUT_MS = 30 * 1000

const sha256 = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex')
const hmac = (key: string | Buffer, data: string) => crypto.createHmac('sha256', key).update(data).digest()

// RFC 3986: everything but letters, digits and -._~ is percent-encoded, which
// is stricter than encodeURIComponent (it leaves !'()* alone).
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

export interface SignedRequest {
  method: string
  // Path already encoded, as it goes on the wire.
  path: string
  host: string
  // Lowercase names; host, x-amz-date and x-amz-content-sha256 are added.
  headers: Record<string, string>
  payloadHash: string
}

/** The headers to send with the request, Authorization included. */
export function signRequest(request: SignedRequest, target: S3Target, now: Date): Record<string, string> {
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const day = amzDate.slice(0, 8)
  const scope = `${day}/${target.region}/s3/aws4_request`

  const headers: Record<string, string> = {
    ...request.headers,
    host: request.host,
    'x-amz-content-sha256': request.payloadHash,
    'x-amz-date': amzDate,
  }
  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')
  const canonicalRequest = [
    request.method,
    request.path,
    '',
    ...names.map((name) => `${name}:${(headers[name] ?? '').trim()}`),
    '',
    signedHeaders,
    request.payloadHash,
  ].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n')

  let key = hmac(`AWS4${target.secretAccessKey}`, day)
  for (const part of [target.region, 's3', 'aws4_request']) key = hmac(key, part)
  const signature = crypto.createHmac('sha256', key).update(stringToSign).digest('hex')

  // fetch sets Host from the URL itself.
  const sent: Record<string, string> = { ...headers }
  delete sent.host
  return {
    ...sent,
    authorization: `AWS4-HMAC-SHA256 Credential=${target.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}

async function send(target: S3Target, method: string, key: string, body: Buffer | null, timeoutMs: number, now: Date) {
  const path = '/' + [target.bucket, ...key.split('/')].map(encodeSegment).join('/')
  const url = new URL(path, target.endpoint)
  const headers = signRequest(
    { method, path, host: url.host, headers: {}, payloadHash: sha256(body ?? '') },
    target,
    now,
  )
  return fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) })
}

// The store's own error code, such as AccessDenied, never the credentials.
async function failure(action: string, response: Response): Promise<S3Error> {
  const text = await response.text().catch(() => '')
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1]
  return new S3Error(`${action} failed: HTTP ${String(response.status)}${code ? ` ${code}` : ''}`)
}

export async function putObject(target: S3Target, key: string, body: Buffer, now = new Date()): Promise<void> {
  const response = await send(target, 'PUT', key, body, PUT_TIMEOUT_MS, now)
  if (!response.ok) throw await failure(`PUT ${key}`, response)
  await response.body?.cancel()
}

export async function objectExists(target: S3Target, key: string, now = new Date()): Promise<boolean> {
  const response = await send(target, 'HEAD', key, null, HEAD_TIMEOUT_MS, now)
  if (response.status === 404) return false
  if (!response.ok) throw await failure(`HEAD ${key}`, response)
  return true
}
