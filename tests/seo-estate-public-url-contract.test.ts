/**
 * SEO estate public URL contract — P0 estate truth (Task 2).
 *
 * Contract:
 *  - Public Marketplace category URLs are `https://market.yousafeconsultancy.com/categories/<id>`.
 *  - Internal Next.js route names under app/marketplace/... do NOT define the public URL contract.
 *  - portal.yousafeconsultancy.com remains a legitimate Portal/auth estate surface,
 *    but is never the Marketplace public canonical.
 *  - The LLM citation estate must recognize the current public Marketplace host.
 */
import fs from 'node:fs'
import path from 'node:path'

import { ESTATE_BASE, marketplaceCategoryHref } from '@/lib/seoEngine/interlink'
import { ESTATE_DOMAINS } from '@/lib/seoEngine/llmVisibility'
import {
  getMarketplaceBaseUrl,
  marketplaceCategoryHref as sharedMarketplaceCategoryHref,
} from '@/lib/marketplaceSeo'

const MARKET_HOST = 'market.yousafeconsultancy.com'
const PORTAL_HOST = 'portal.yousafeconsultancy.com'
const RETIRED_MARKETPLACE_CATEGORIES_PATH = '/marketplace/categories/'

const root = process.cwd()
const readSource = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

/**
 * Strip comments so the source-level contract only sees EXECUTABLE code.
 * The original defect dynamically assembled the retired URL
 * (`ESTATE_BASE.market` + `/marketplace/categories/`), and a whole-literal
 * check alone can be evaded by such composition — or hidden in prose.
 * Block comments are removed first; then whole-line `//` and JSDoc `*` lines.
 * Inline `//` after code is deliberately NOT stripped because URLs contain
 * `//` (e.g. https://host/path) and would be corrupted.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*')
    })
    .join('\n')
}

describe('SEO estate public URL contract (P0 estate truth)', () => {
  test('marketplaceCategoryHref emits the clean public market-host category URL', () => {
    expect(marketplaceCategoryHref('study-permits')).toBe(
      `https://${MARKET_HOST}/categories/study-permits`,
    )
  })

  test('marketplaceCategoryHref falls back to the immigration category for unknown services', () => {
    expect(marketplaceCategoryHref('not-a-real-service')).toBe(
      `https://${MARKET_HOST}/categories/immigration`,
    )
  })

  test('ESTATE_DOMAINS includes the public Marketplace host and keeps Portal as an explicit estate surface', () => {
    expect(ESTATE_DOMAINS).toContain(MARKET_HOST)
    // Portal stays only as a legitimate Portal/auth surface — never as the
    // Marketplace public canonical host (that is MARKET_HOST above).
    expect(ESTATE_DOMAINS).toContain(PORTAL_HOST)
  })

  test('interlink estate base is the canonical market host, never the retired Portal-host base', () => {
    // Defense-in-depth for the original defect: the retired URL was built
    // dynamically as ESTATE_BASE.market + '/marketplace/categories/<id>', so
    // the base map itself must point at the canonical Marketplace host.
    expect(ESTATE_BASE.market).toBe(getMarketplaceBaseUrl())
    expect(ESTATE_BASE.market).toBe(`https://${MARKET_HOST}`)
  })

  test('executable interlink source contains no retired path literal and no Portal-host market base', () => {
    const executable = stripComments(readSource('lib/seoEngine/interlink.ts'))
    // No composed-or-literal retired category path in runnable code…
    expect(executable).not.toContain(RETIRED_MARKETPLACE_CATEGORIES_PATH)
    // …and no assignment of the market estate base to the Portal host
    // (any executable occurrence of the Portal host in this engine file is a
    // regression of the original defect).
    expect(executable).not.toContain(PORTAL_HOST)
  })

  test('shared marketplaceCategoryHref never emits a bare /categories/ for blank input', () => {
    expect(sharedMarketplaceCategoryHref('')).toBe(
      `https://${MARKET_HOST}/categories/immigration`,
    )
  })

  test('Marketplace base URL derives from the canonical market host, not Portal', () => {
    expect(getMarketplaceBaseUrl()).toBe(`https://${MARKET_HOST}`)
  })
})
