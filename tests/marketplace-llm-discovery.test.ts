import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const MARKET_AGENTS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-User',
]

describe('marketplace LLM discovery', () => {
  const robots = read('app/robots.ts')
  const llms = read('public/llms.txt')
  const landing = read('app/marketplace/PublicMarketplaceLanding.tsx')

  test('robots stay host-aware: market lists five agents, portal keeps only the wildcard and no sitemap', () => {
    expect(robots).toContain("const MARKET_HOST = 'market.yousafeconsultancy.com'")
    expect(robots).toContain("const PORTAL_HOST = 'portal.yousafeconsultancy.com'")
    expect(robots).toContain("userAgent: '*'")
    expect(robots).toContain("allow: '/'")
    expect(robots).toContain("disallow: ['/api/']")
    expect(robots).not.toContain("'/_next/static/'")
    expect(robots).toContain('if (host === MARKET_HOST)')
    for (const agent of MARKET_AGENTS) {
      expect(robots).toContain("'" + agent + "'")
    }
    expect(robots).toContain('result.sitemap = `https://${MARKET_HOST}/sitemap.xml`')
    expect(robots.match(/result\.sitemap/g)).toEqual([
      'result.sitemap',
    ])
    const marketBlock = robots.slice(robots.indexOf('if (host === MARKET_HOST)'))
    expect(marketBlock).toContain('userAgent: [')
    expect(marketBlock).toContain('result.sitemap')
    expect(marketBlock.indexOf("'OAI-SearchBot'")).toBeGreaterThan(-1)
    expect(robots.indexOf("userAgent: '*'")).toBeLessThan(robots.indexOf('if (host === MARKET_HOST)'))
  })

  test('llms.txt covers four countries and separates legal guides from marketplace commerce', () => {
    for (const name of ['United States', 'United Kingdom', 'Canada', 'Australia']) {
      expect(llms).toContain(name)
    }
    expect(llms).toContain('https://usa.yousafeconsultancy.com')
    expect(llms).toContain('https://ca.yousafeconsultancy.com')
    expect(llms).toContain('https://uk.yousafeconsultancy.com')
    expect(llms).toContain('https://au.yousafeconsultancy.com')
    expect(llms).toMatch(/not a law firm/i)
    expect(llms).toMatch(/licensed attorneys/i)
    expect(llms).toContain('https://legal.yousafeconsultancy.com')
    expect(llms).toContain('https://market.yousafeconsultancy.com/')
    expect(llms).toMatch(/private account utilities/i)
    expect(llms).not.toMatch(/^## Optional/m)
    expect(llms).not.toMatch(/escrow|encrypted transactions|compliance/i)
    expect(llms).toContain('https://yousafeconsultancy.com')
    expect(llms).not.toContain('https://portal.yousafeconsultancy.com/sign-in/student')
    expect(llms).not.toContain('https://portal.yousafeconsultancy.com/sign-up/attorney')
    expect(llms).toContain('https://payhip.com/YousafeConsultancy')
  })

  test('Service JSON-LD keeps a stable market @id and organization provider @id', () => {
    const block = landing.slice(landing.indexOf('const SERVICE_JSONLD'), landing.indexOf('const FAQS'))
    expect(block).toContain("url: 'https://market.yousafeconsultancy.com/'")
    expect(block).toContain("'@id': 'https://market.yousafeconsultancy.com/#service'")
    expect(block).toContain("'@id': 'https://yousafeconsultancy.com/#organization'")
    expect(block).toContain("name: 'YouSafe Consultancy'")
    expect(block).toContain("url: 'https://yousafeconsultancy.com'")
  })
})
