import { readFileSync } from 'node:fs'

describe('Cloudflare Free-plan deployment config', () => {
  it('does not send paid-only runtime limits to the Workers API', () => {
    const wrangler = readFileSync('wrangler.toml', 'utf8')
    const activeConfig = wrangler
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, '').trim())
      .filter(Boolean)
      .join('\n')

    expect(activeConfig).not.toMatch(/^\[limits\]$/m)
    expect(activeConfig).not.toMatch(/^(?:cpu_ms|subrequests)\s*=/m)
  })
})
