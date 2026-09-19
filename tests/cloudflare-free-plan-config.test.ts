import { readFileSync } from 'node:fs'

function activeWranglerConfig(): string {
  return readFileSync('wrangler.toml', 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
}

describe('Cloudflare Workers Free-plan deployment config', () => {
  it('does not send a paid-only limits block to Wrangler', () => {
    const wrangler = activeWranglerConfig()

    expect(wrangler).not.toMatch(/^\s*\[limits\]\s*$/m)
    expect(wrangler).not.toMatch(/^\s*cpu_ms\s*=/m)
    expect(wrangler).not.toMatch(/^\s*subrequests\s*=/m)
  })
})
