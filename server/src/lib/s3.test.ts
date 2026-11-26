import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { describe, test } from 'node:test'
import { fakeStore } from '../../test/s3.ts'
import { objectExists, putObject, S3Error, signRequest, type S3Target } from './s3.ts'

const sha256 = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex')

// The examples in AWS's Signature Version 4 documentation for S3
// ("Examples: Signature calculations in AWS Signature Version 4").
describe('signRequest', () => {
  const aws: S3Target = {
    endpoint: 'https://examplebucket.s3.amazonaws.com',
    region: 'us-east-1',
    bucket: 'examplebucket',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  }
  const now = new Date('2013-05-24T00:00:00Z')
  const host = 'examplebucket.s3.amazonaws.com'

  test('matches the GET object example', () => {
    const headers = signRequest(
      { method: 'GET', path: '/test.txt', host, headers: { range: 'bytes=0-9' }, payloadHash: sha256('') },
      aws,
      now,
    )
    assert.equal(
      headers.authorization,
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
    assert.equal(headers['x-amz-date'], '20130524T000000Z')
    assert.equal(headers.host, undefined)
  })

  test('matches the PUT object example', () => {
    const headers = signRequest(
      {
        method: 'PUT',
        path: '/test%24file.text',
        host,
        headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
        payloadHash: sha256('Welcome to Amazon S3.'),
      },
      aws,
      now,
    )
    assert.match(headers.authorization ?? '', /Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd$/)
  })
})

const NOW = new Date('2026-11-26T12:00:00Z')

describe('putObject', () => {
  test('sends the body to bucket/key, signed with its hash', async () => {
    const { target, received } = await fakeStore()
    const body = Buffer.from('encrypted backup')

    await putObject(target, 'adun/auto-20261126-120000Z.sqlite.age', body, NOW)

    const [request] = received
    assert.equal(request?.method, 'PUT')
    assert.equal(request.url, '/backups/adun/auto-20261126-120000Z.sqlite.age')
    assert.deepEqual(request.body, body)
    assert.equal(request.headers['x-amz-content-sha256'], sha256(body))
    assert.equal(request.headers['x-amz-date'], '20261126T120000Z')
    assert.match(
      request.headers.authorization ?? '',
      /^AWS4-HMAC-SHA256 Credential=test-key-id\/20261126\/auto\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    )
  })

  test('encodes each part of the key, keeping the slashes', async () => {
    const { target, received } = await fakeStore()
    await putObject(target, "my backups/copy (1)!.age", Buffer.from(''), NOW)
    assert.equal(received[0]?.url, '/backups/my%20backups/copy%20%281%29%21.age')
  })

  test('a refusal names the status and the store’s code, never the secret', async () => {
    const { target, answers } = await fakeStore()
    answers.push({ status: 403, body: '<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>' })

    await assert.rejects(putObject(target, 'adun/x.age', Buffer.from('x'), NOW), (error: unknown) => {
      assert.ok(error instanceof S3Error)
      assert.equal(error.message, 'PUT adun/x.age failed: HTTP 403 AccessDenied')
      assert.ok(!error.message.includes('test-secret'))
      return true
    })
  })
})

describe('objectExists', () => {
  test('true for 200, false for 404, and an error for anything else', async () => {
    const { target, received, objects, answers } = await fakeStore()
    objects.set('/backups/adun/a.age', Buffer.from('a'))
    answers.push({ status: 403 })

    await assert.rejects(objectExists(target, 'adun/c.age', NOW), /HEAD adun\/c\.age failed: HTTP 403$/)
    assert.equal(await objectExists(target, 'adun/a.age', NOW), true)
    assert.equal(await objectExists(target, 'adun/b.age', NOW), false)

    assert.deepEqual(
      received.map((request) => [request.method, request.url, request.headers['x-amz-content-sha256']]),
      [
        ['HEAD', '/backups/adun/c.age', sha256('')],
        ['HEAD', '/backups/adun/a.age', sha256('')],
        ['HEAD', '/backups/adun/b.age', sha256('')],
      ],
    )
  })
})
