import fs from 'node:fs'
import path from 'node:path'
import { getMarketplaceCanonicalPath, getMarketplaceCanonicalUrl } from '@/lib/marketplaceSeo'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const middleware = read('middleware.ts')
const sitemap = read('app/sitemap.ts')
const gigPage = read('app/marketplace/gigs/[slug]/page.tsx')
const gigApi = read('app/api/marketplace/gigs/[slug]/route.ts')
const authShell = read('components/auth-shell.tsx')

const runtimeRoots = ['app', 'components', 'lib']
const runtimeExtensions = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.mjs', '.cjs'])
const allowedLegacyReaders = new Set([
  'app/sitemap.ts',
  'components/auth-shell.tsx',
  'lib/marketplaceSeo.ts',
])

const retiredRelativeLiteral = /['"`]\/marketplace(?=[/?'"`])/g
const retiredAbsoluteMarketUrl = /https:\/\/market\.yousafeconsultancy\.com\/marketplace(?=[/?'"`])/g

function runtimeLines(file: string): string[] {
  return read(file)
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      return !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')
    })
}

function walkRuntimeFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(root, relativeDir)
  const out: string[] = []
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDir, entry.name)
    if (entry.isDirectory()) {
      out.push(...walkRuntimeFiles(relativePath))
      continue
    }
    if (entry.isFile() && runtimeExtensions.has(path.extname(entry.name))) out.push(relativePath)
  }
  return out
}

const runtimeFiles = runtimeRoots.flatMap(walkRuntimeFiles)

describe('Marketplace public URL retirement', () => {
  test('hard-404s the retired /marketplace namespace on both public hosts', () => {
    expect(middleware).toContain("const isLegacyMarketplacePath = pathname === '/marketplace' || pathname.startsWith('/marketplace/')")
    expect(middleware).toContain('(hostname === MARKET_HOST || hostname === PORTAL_HOST) && isLegacyMarketplacePath')
    expect(middleware).toContain("return new NextResponse('Not Found', {")
    expect(middleware).toContain('status: 404')
  })

  test('keeps clean market URLs as browser-facing paths while rewriting only internally', () => {
    expect(middleware).toContain('const rewrite = new URL(`/marketplace${pathname}${search}`, req.url)')
    expect(middleware).toContain('NextResponse.rewrite(rewrite)')
    expect(getMarketplaceCanonicalPath('/gigs/example')).toBe('/gigs/example')
    expect(getMarketplaceCanonicalUrl('/gigs/example')).toBe('https://market.yousafeconsultancy.com/gigs/example')
    expect(() => getMarketplaceCanonicalPath('/marketplace')).toThrow('retired /marketplace prefix')
    expect(() => getMarketplaceCanonicalUrl('/marketplace/gigs/example')).toThrow('retired /marketplace prefix')
  })

  test('emits clean gig URLs from metadata, slug aliases, API SEO and sitemap', () => {
    expect(gigPage).toContain('getMarketplaceCanonicalUrl(`/gigs/${slug}`)')
    expect(gigPage).toContain('permanentRedirect(`/gigs/${redirected}`)')
    expect(gigPage).not.toContain('permanentRedirect(`/marketplace/gigs/${redirected}`)')
    expect(gigApi).toContain('canonical_path: `/gigs/${gig.slug}`')
    expect(sitemap).toContain('url: `${base}${clean(`/gigs/${gig.slug}`)}`')
    expect(sitemap).toContain('url: `${base}${clean(`/providers/${token}`)}`')
    expect(sitemap).not.toContain('mp(`/marketplace')
  })

  test('sanitizes stale auth return targets without keeping public HTTP redirect compatibility', () => {
    expect(authShell).toContain("const MARKET_ORIGIN = 'https://market.yousafeconsultancy.com'")
    expect(authShell).toContain("value === '/marketplace'")
    expect(authShell).toContain('return `${MARKET_ORIGIN}${cleanPath}${url.search}${url.hash}`')
    expect(authShell).not.toContain('window.location.replace')
  })

  test('emits no retired public Marketplace URL anywhere in runtime code', () => {
    const failures: string[] = []
    for (const file of runtimeFiles) {
      if (allowedLegacyReaders.has(file)) continue
      const runtime = runtimeLines(file)
        .join('\n')
        .replaceAll('/api/marketplace', '/api/__marketplace_internal')
      if (retiredRelativeLiteral.test(runtime) || retiredAbsoluteMarketUrl.test(runtime)) failures.push(file)
      retiredRelativeLiteral.lastIndex = 0
      retiredAbsoluteMarketUrl.lastIndex = 0
    }
    expect(failures).toEqual([])
  })
})
