/**
 * Regression: public Marketplace routes must never return profile emails.
 *
 * These routes run on the Supabase service-role client (RLS does not apply),
 * so the only protection for `profiles.email` is the projection itself.
 * Production leak (2026-10-02): GET /api/marketplace/gigs, the gig detail
 * route and the reputation route embedded `email` in the provider object, and
 * /api/sellers/[id]/reviews returned each reviewer's email.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { CATEGORIES, getCategoryFilterTerms } from '@/lib/categories'

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const PUBLIC_ROUTES = [
  'app/api/marketplace/gigs/route.ts',
  'app/api/marketplace/gigs/[slug]/route.ts',
  'app/api/marketplace/gigs/[slug]/reputation/route.ts',
  'app/api/sellers/[id]/reviews/route.ts',
]

describe('public marketplace routes do not expose emails', () => {
  it.each(PUBLIC_ROUTES)('%s: no profiles embed selects email', (rel) => {
    const src = read(rel)
    // provider:profiles!fk(...) / profiles(...) embeds
    const embeds = src.match(/profiles(?:![a-z_]+)?\(([^)]*)\)/g) || []
    for (const embed of embeds) {
      expect(embed).not.toMatch(/\bemail\b/)
    }
    // direct .from('profiles').select('...') projections
    const directSelects = src.match(/from\('profiles'\)\s*\.select\('([^']*)'\)/g) || []
    for (const sel of directSelects) {
      expect(sel).not.toMatch(/\bemail\b/)
    }
  })

  it('seller reviews response does not map a client email', () => {
    const src = read('app/api/sellers/[id]/reviews/route.ts')
    expect(src).not.toMatch(/email:\s*clientProfile\.email/)
  })

  it('gig detail JSON-LD provider name never falls back to email', () => {
    const src = read('app/api/marketplace/gigs/[slug]/route.ts')
    expect(src).not.toMatch(/provider\?\.email/)
  })
})

describe('academic subcategories use editing-only labels', () => {
  const academic = CATEGORIES.find((c) => c.id === 'academic-writing')!

  it('renames SOP Writing -> SOP Editing and Research Writing -> Research Editing (ids unchanged)', () => {
    const byId = Object.fromEntries(academic.subcategories.map((s) => [s.id, s.name]))
    expect(byId['sop-writing']).toBe('SOP Editing')
    expect(byId['research-writing']).toBe('Research Editing')
    const names = academic.subcategories.map((s) => s.name)
    expect(names).not.toContain('SOP Writing')
    expect(names).not.toContain('Research Writing')
  })

  it('keeps legacy labels as filter terms so stored category values still match', () => {
    const terms = getCategoryFilterTerms('academic-writing')
    expect(terms).toEqual(expect.arrayContaining(['SOP Writing', 'SOP Editing', 'Research Editing', 'sop-writing', 'research-writing']))
  })
})
