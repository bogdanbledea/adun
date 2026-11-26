import http from 'node:http'
import { after } from 'node:test'
import type { S3Target } from '../src/lib/s3.ts'

export interface ReceivedRequest {
  method: string
  url: string
  headers: http.IncomingHttpHeaders
  body: Buffer
}

/* A stand-in for an S3 store on a random local port. It keeps what is PUT and
   answers HEAD from that, unless the test queued another answer first. */
export async function fakeStore() {
  const received: ReceivedRequest[] = []
  const objects = new Map<string, Buffer>()
  const answers: { status: number; body?: string }[] = []
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const request = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) }
      received.push(request)
      let answer = answers.shift()
      if (answer === undefined && request.method === 'PUT') {
        objects.set(request.url, request.body)
        answer = { status: 200 }
      }
      answer ??= { status: objects.has(request.url) ? 200 : 404 }
      res.writeHead(answer.status, { 'content-type': 'application/xml' })
      res.end(request.method === 'HEAD' ? undefined : answer.body)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  after(() => {
    server.close()
  })
  const { port } = server.address() as { port: number }
  const target: S3Target = {
    endpoint: `http://127.0.0.1:${String(port)}`,
    region: 'auto',
    bucket: 'backups',
    accessKeyId: 'test-key-id',
    secretAccessKey: 'test-secret',
  }
  return { target, received, objects, answers }
}
