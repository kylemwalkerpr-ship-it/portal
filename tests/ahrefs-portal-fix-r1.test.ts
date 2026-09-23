import fs from 'node:fs'
import path from 'node:path'
import { getMarketplaceTemplatesRedirectUrl } from '@/lib/marketplaceTemplatesRedirect'
import { MARKETPLACE_OG_IMAGE } from '@/lib/publicOgImages'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const objectAfter = (source: string, marker: string) => {
  const start = source.indexOf(marker)
  if (start < 0) return ''
  const open = source.indexOf('{', start + marker.length)
  if (open < 0) return ''
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) return source.slice(open, index + 1)
  }
  return ''
}

describe('AHREFS-PORTAL-FIX-R1', () => {
  test('Clerk browser SDK build and runtime pins agree on one exact patch', () => {
    const workflow = read('.github/workflows/deploy.yml')
    const wrangler = read('wrangler.toml')
    const workflowPin = workflow.match(/NEXT_PUBLIC_CLERK_JS_VERSION:\s*['"]?([^'"\s]+)['"]?/)
    const runtimePin = wrangler.match(/^NEXT_PUBLIC_CLERK_JS_VERSION\s*=\s*"([^"]+)"/m)

    expect(workflowPin?.[1]).toBe('6.32.0')
    expect(runtimePin?.[1]).toBe('6.32.0')
    expect(workflowPin?.[1]).toMatch(/^\d+\.\d+\.\d+$/)
    expect(runtimePin?.[1]).toBe(workflowPin?.[1])
  })

  test('market /templates aliases redirect to the shop before the generic rewrite', () => {
    expect(getMarketplaceTemplatesRedirectUrl(new URL('https://market.yousafeconsultancy.com/templates'))?.toString())
      .toBe('https://market.yousafeconsultancy.com/shop')
    expect(getMarketplaceTemplatesRedirectUrl(new URL('https://market.yousafeconsultancy.com/templates/?ref=old&utm_source=x'))?.toString())
      .toBe('https://market.yousafeconsultancy.com/shop?ref=old')
    expect(getMarketplaceTemplatesRedirectUrl(new URL('https://market.yousafeconsultancy.com/templates?utm_source=x'))?.toString())
      .toBe('https://market.yousafeconsultancy.com/shop')
    expect(getMarketplaceTemplatesRedirectUrl(new URL('https://market.yousafeconsultancy.com/templates-old'))).toBeNull()

    const marketHandler = read('middleware.ts').split('function handleMarketHostRequest')[1].split('/**')[0]
    expect(marketHandler).toContain('NextResponse.redirect(templatesDestination, { status: 301 })')
    expect(marketHandler.indexOf('getMarketplaceTemplatesRedirectUrl')).toBeLessThan(marketHandler.indexOf('const internalPath'))
    expect(marketHandler.indexOf('getMarketplaceTemplatesRedirectUrl')).toBeLessThan(marketHandler.indexOf('stripTrackingParams'))
  })

  test('all public Portal and Marketplace route-level Open Graph blocks include their host image', () => {
    expect(MARKETPLACE_OG_IMAGE).toBe('https://market.yousafeconsultancy.com/og-image.png')

    const marketRoutes = [
      'app/marketplace/page.tsx',
      'app/marketplace/gigs/page.tsx',
      'app/marketplace/gigs/[slug]/page.tsx',
      'app/marketplace/categories/page.tsx',
      'app/marketplace/categories/[categoryId]/page.tsx',
      'app/marketplace/providers/page.tsx',
      'app/marketplace/providers/[id]/page.tsx',
      'app/shop/page.tsx',
      'app/shop/[slug]/page.tsx',
      'app/payhip-product/[slug]/page.tsx',
    ]
    for (const route of marketRoutes) {
      const source = read(route)
      const openGraph = objectAfter(source, 'openGraph:')
      expect(openGraph).toContain('images:')
      expect(openGraph).toContain('MARKETPLACE_OG_IMAGE')
    }

    for (const route of [
      'app/marketplace/categories/[categoryId]/page.tsx',
      'app/marketplace/providers/[id]/page.tsx',
    ]) {
      const source = read(route)
      const openGraph = objectAfter(source, 'openGraph:')
      expect(openGraph).toContain('images: allowIndex ? [MARKETPLACE_OG_IMAGE] : undefined')
    }

  })
})
