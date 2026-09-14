import { readFileSync } from 'node:fs'

describe('SuperGrok Cloudflare self-host transport', () => {
  it('enables public same-host fetch compatibility for the Portal Worker', () => {
    const wrangler = readFileSync('wrangler.toml', 'utf8')
    expect(wrangler).toMatch(/compatibility_flags\s*=\s*\[[^\]]*global_fetch_strictly_public/)
  })
})
