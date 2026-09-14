import { readFileSync } from 'node:fs'

describe('SuperGrok configurator status copy', () => {
  it('separates OAuth connection from live inference health', () => {
    const source = readFileSync('components/design/ai-key-vault-panel.tsx', 'utf8')
    expect(source).toContain('OAuth connected ·')
    expect(source).toContain('inference unverified — press Test')
    expect(source).toContain('inference healthy')
    expect(source).toContain('inference degraded — see test result below')
  })
})
