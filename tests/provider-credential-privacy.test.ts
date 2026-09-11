/// <reference types="jest" />

/**
 * CREDENTIAL PRIVACY GATE — static source-contract regression.
 *
 * Exact professional identifiers (bar / licence / registration / regulator IDs)
 * must not ship on list/search APIs, SSR seeds, SEO author packs, or generation
 * model facts. The controlled sellers/[id] bio-card path (gated by
 * isAttorneyCredentialPublic / consultant admin override) is the sole public
 * serializer, rendered only via SellerAbout data-field=provider-credential-number.
 */

import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), 'utf8')

describe('Credential privacy — list/search APIs never serialize identifiers', () => {
  const listSearchRoutes = [
    'app/api/sellers/route.ts',
    'app/api/attorneys/route.ts',
    'app/api/attorneys/search/route.ts',
  ]

  for (const rel of listSearchRoutes) {
    it(`${rel} does not serialize bar_number / registration_number / credential_number`, () => {
      const src = read(rel)
      expect(src).not.toMatch(/\bbar_number\s*:/)
      expect(src).not.toMatch(/\bregistration_number\s*:/)
      expect(src).not.toMatch(/\bcredential_number\s*:/)
    })
  }

  it('legacy attorneys/[id] detail also omits identifier serialization', () => {
    const src = read('app/api/attorneys/[id]/route.ts')
    expect(src).not.toMatch(/\bbar_number\s*:/)
    expect(src).not.toMatch(/\bregistration_number\s*:/)
    expect(src).not.toMatch(/\bcredential_number\s*:/)
    expect(src).toMatch(/never serialize the number|intentionally omitted|bio-card/i)
  })
})

describe('Credential privacy — sellers/[id] is the gated bio-card exception', () => {
  const src = read('app/api/sellers/[id]/route.ts')

  it('uses isAttorneyCredentialPublic before exposing attorney identifiers', () => {
    expect(src).toContain('isAttorneyCredentialPublic')
    expect(src).toContain('resolveAttorneyCredential')
    expect(src).toMatch(/credential\.bar_number\s*&&\s*isAttorneyCredentialPublic\(credential\)/)
  })

  it('applies consultant admin override before exposing registration numbers', () => {
    expect(src).toContain('admin_show_registration_number_override')
    expect(src).toContain('show_registration_number')
    expect(src).toMatch(/effectiveVisibility/)
    expect(src).toMatch(/credential_number:\s*credentialNumber/)
  })

  it('documents credential_number as the sole public identifier field', () => {
    expect(src).toMatch(/only public API field that carries the identifier/i)
  })
})

describe('Credential privacy — SellerAbout controlled bio-card field', () => {
  it('renders credential_number only via data-field=provider-credential-number', () => {
    const src = read('components/marketplace/SellerProfileComponents.tsx')
    expect(src).toContain('data-field="provider-credential-number"')
    expect(src).toMatch(/credential_number\s*&&/)
    expect(src).toMatch(/SellerAbout/)
    const header = src.slice(src.indexOf('export function SellerProfileHeader'), src.indexOf('export function SellerStats'))
    expect(header).not.toMatch(/credential_number/)
    expect(header).not.toMatch(/bar_number/)
  })
})

describe('Credential privacy — SSR provider page seeds no identifier fields', () => {
  it('marketplace providers/[id] SSR article and initialSeller omit .bar_number / .registration_number', () => {
    const src = read('app/marketplace/providers/[id]/page.tsx')
    expect(src).not.toMatch(/\.bar_number\b/)
    expect(src).not.toMatch(/\.registration_number\b/)
    expect(src).not.toMatch(/\bbar_number\s*:/)
    expect(src).not.toMatch(/\bregistration_number\s*:/)
    expect(src).not.toMatch(/\bcredential_number\s*:/)
  })
})

describe('Credential privacy — SEO providerAuthors never concatenates barNumber', () => {
  it('credentialLineFor joins only credential type + jurisdiction', () => {
    const src = read('lib/seoFactory/providerAuthors.ts')
    const start = src.indexOf('export function credentialLineFor')
    expect(start).toBeGreaterThan(-1)
    const body = src.slice(start, src.indexOf('export function experienceScopeFor', start))
    expect(body).toMatch(/Never append barNumber/i)
    expect(body).not.toMatch(/bits\.push\([^\)]*barNumber/)
    expect(body).not.toMatch(/`\$\{[^}]*barNumber/)
    expect(body).not.toMatch(/bar \$\{/)
    expect(body).toContain("bits.join(' · ')")
  })
})

describe('Credential privacy — generation scripts keep exact IDs out of model facts', () => {
  it('rewrite-marketplace-copy.mjs providerFacts has no public_bar_number / exact registration_number', () => {
    const src = read('scripts/rewrite-marketplace-copy.mjs')
    const start = src.indexOf('function providerFacts')
    const facts = src.slice(start, src.indexOf('function validateGig', start))
    expect(facts).not.toContain('public_bar_number')
    expect(facts).not.toMatch(/registration_number:\s*consultant/)
    expect(facts).toContain('credential_type')
    expect(facts).toContain('bar_state')
    expect(facts).toMatch(/credential_verified|credential_on_file/)
    expect(facts).toContain('registration_verified')
    expect(src).toMatch(/PRIVACY RULE: Never include professional credential identifiers/)
  })

  it('rewrite-marketplace-profiles-fiverr-v2.mjs providerFacts has no public_bar_number', () => {
    const src = read('scripts/rewrite-marketplace-profiles-fiverr-v2.mjs')
    const start = src.indexOf('function providerFacts')
    const facts = src.slice(start, src.indexOf('function validateDraft', start))
    expect(facts).not.toContain('public_bar_number')
    expect(facts).toContain('registration_verified')
    expect(facts).toContain('credential_type')
    expect(src).toMatch(/Never include professional credential identifiers/)
  })

  it('marketplace-clean-templated-bios.mjs forbids numbers as narrative authoring facts', () => {
    const src = read('scripts/marketplace-clean-templated-bios.mjs')
    expect(src).toMatch(/Bar\/registration NUMBERS are NEVER narrative authoring facts/)
    expect(src).not.toMatch(/'consultants\.registration_number'/)
    expect(src).toMatch(/consultants\.registration_verified/)
  })
})
