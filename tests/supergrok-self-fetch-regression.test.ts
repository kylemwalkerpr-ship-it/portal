import { readFileSync } from 'node:fs'

/**
 * The SuperGrok subscription shim is intentionally reached through the
 * Portal's public Custom Domain. Cloudflare requires public global-fetch
 * semantics for a Worker to fetch its own Custom Domain without a 522.
 */
describe('SuperGrok Cloudflare self-host transport', () => {
  it('enables public same-host fetch compatibility for the Portal Worker', () => {
    const wrangler = readFileSync('wrangler.toml', 'utf8')
    expect(wrangler).toMatch(/compatibility_flags\s*=\s*\[[^\]]*global_fetch_strictly_public/)
  })
})
