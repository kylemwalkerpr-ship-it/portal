import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

const root = path.join(__dirname, '..')

describe('Phase 5 security headers', () => {
  const cfg = fs.readFileSync(path.join(root, 'next.config.ts'), 'utf8')
  test('enforced baseline CSP plus the other headers', () => {
    const csp = cfg.match(/key: 'Content-Security-Policy',\s+value: "([^"]+)"/)?.[1] ?? ''
    for (const d of ["default-src 'self' https:", "object-src 'none'", "base-uri 'self'", "form-action 'self' https:", "frame-ancestors 'self'", 'upgrade-insecure-requests']) {
      expect(csp).toContain(d)
    }
    for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']) {
      expect(cfg).toContain(h)
    }
    expect(cfg).toContain('poweredByHeader: false')
  })
})

describe('Phase 5 translate CORS', () => {
  const routes = ['app/api/translate/route.ts', 'app/api/translate/batch/route.ts']
  test.each(routes)('%s never returns a wildcard origin', (r) => {
    const src = fs.readFileSync(path.join(root, r), 'utf8')
    expect(src).not.toMatch(/Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/)
    expect(src).not.toContain('Access-Control-Allow-Credentials')
  })

  test.each(routes)('%s preflight echoes yousafe origins only', async (r) => {
    jest.resetModules()
    const mod = await import(path.join(root, r))
    const pre = (origin: string) =>
      mod.OPTIONS(new NextRequest('https://portal.yousafeconsultancy.com/api/translate', { method: 'OPTIONS', headers: { origin } }))
    const ok = await pre('https://usa.yousafeconsultancy.com')
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://usa.yousafeconsultancy.com')
    const bad = await pre('https://evil.example')
    expect(bad.headers.get('access-control-allow-origin')).toBeNull()
    const sneaky = await pre('https://yousafeconsultancy.com.evil.example')
    expect(sneaky.headers.get('access-control-allow-origin')).toBeNull()
  })
})
