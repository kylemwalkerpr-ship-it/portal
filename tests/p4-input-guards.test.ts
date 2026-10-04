import fs from 'fs'
import path from 'path'
import {
  MAX_ANSWERS_BYTES,
  boundedObject,
  clientIp,
  hashClientKey,
  isUuid,
  singleLine,
} from '../lib/inquiryGuards'
import { isAllowedAttachment } from '../lib/messageAttachments'

describe('Phase 4: intake input guards', () => {
  test('isUuid accepts uuids only', () => {
    expect(isUuid('3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBe(true)
    expect(isUuid('1 or 1=1')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(42)).toBe(false)
  })

  test('boundedObject caps serialized size and ignores non-objects', () => {
    expect(boundedObject({ a: 1 }, MAX_ANSWERS_BYTES)).toEqual({ a: 1 })
    expect(boundedObject({ a: 'x'.repeat(MAX_ANSWERS_BYTES + 1) }, MAX_ANSWERS_BYTES)).toBeNull()
    expect(boundedObject(undefined, 10)).toEqual({})
    expect(boundedObject(['a'], 10)).toEqual({})
  })

  test('singleLine strips header-injection characters', () => {
    expect(singleLine('Jane\r\nBcc: evil@example.com')).toBe('Jane Bcc: evil@example.com')
  })

  test('clientIp prefers cf-connecting-ip and hashes are stable, never raw', async () => {
    const req = new Request('https://x.test', { headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1' } })
    expect(clientIp(req)).toBe('203.0.113.9')
    const a = await hashClientKey('203.0.113.9', 's')
    const b = await hashClientKey('203.0.113.9', 's')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(a).not.toContain('203')
  })

  test('inquiries route rate-limits, bounds payloads and escapes attorney email', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/api/inquiries/route.ts'), 'utf8')
    expect(src).toContain('INQUIRY_EMAIL_LIMIT_PER_HOUR')
    expect(src).toContain("eq('meta->>ip_hash', ipHash)")
    expect(src).toMatch(/status\s*:?\s*\)?[^\n]*429|, 429\)/)
    expect(src).toContain('MAX_INQUIRY_BODY_BYTES')
    expect(src).toContain('<strong>${escapeHtml(fullName)}</strong> just sent you')
    expect(src).not.toMatch(/<strong>\$\{fullName\}<\/strong>/)
    expect(src).not.toMatch(/Urgency:<\/strong> \$\{urgency\}/)
  })
})

describe('Phase 4: chat attachment allowlist', () => {
  test.each([
    ['scan.pdf', 'application/pdf'],
    ['photo.JPG', 'image/jpeg'],
    ['cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['data.csv', ''],
    ['voice.webm', 'audio/webm;codecs=opus'],
  ])('allows %s', (name, mime) => {
    expect(isAllowedAttachment(name, mime)).toBe(true)
  })

  test.each([
    ['x.svg', 'image/svg+xml'],
    ['page.html', 'text/html'],
    ['run.exe', 'application/octet-stream'],
    ['fake.pdf', 'text/html'],
    ['noext', 'application/pdf'],
  ])('rejects %s', (name, mime) => {
    expect(isAllowedAttachment(name, mime)).toBe(false)
  })
})
