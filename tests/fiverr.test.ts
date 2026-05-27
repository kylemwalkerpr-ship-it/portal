/**
 * fiverr.test.ts
 *
 * Unit tests for slug-building and SEO utilities in lib/fiverr.ts.
 * buildSlug is a pure function; buildUniqueSlug needs a mock DB client.
 */

/// <reference types="jest" />

import { buildSlug, buildUniqueSlug } from '@/lib/fiverr'

// Helper to create a mock Supabase chain that returns a given data set.
// The .select().like() chain must resolve to { data: row[] }.
function mockDb(existingSlugs: string[]) {
  const chain = {
    select: () => chain,
    like: () => chain,
    then: (fn: (v: { data: { slug: string }[] }) => any) =>
      Promise.resolve(fn({ data: existingSlugs.map(s => ({ slug: s })) })),
  }
  return { from: () => chain } as any
}

// ────────────────────────────────────────────────────────────
// buildSlug
// ────────────────────────────────────────────────────────────

describe('buildSlug', () => {
  it('converts a basic title to a clean slug', () => {
    expect(buildSlug('Draft Education Petitions')).toBe('draft-education-petitions')
  })

  it('normalises unicode characters (é → e, ñ → n)', () => {
    expect(buildSlug('Café resume piñata')).toBe('cafe-resume-pinata')
  })

  it('removes stop words (a, an, the, of, for, to, in, on, and, or)', () => {
    expect(buildSlug('The Best of Immigration for Students')).toBe('best-immigration-students')
  })

  it('removes leading Fiverr-style preamble', () => {
    expect(buildSlug('I will draft your legal document')).toBe('draft-legal-document')
    expect(buildSlug('We help you get your study permit')).toBe('study-permit')
    expect(buildSlug('You can apply for a visa with ease')).toBe('apply-visa-ease')
  })

  it('strips apostrophes without inserting dashes', () => {
    expect(buildSlug("Student's Guide to Canada")).toBe('students-guide-canada')
    expect(buildSlug("Attorney's Advice for 'clients'")).toBe('attorneys-advice-clients')
  })

  it('trims slugs longer than 70 characters at a word boundary', () => {
    const long = 'Comprehensive Step by Step Guide to Applying for a Canadian Study Permit from International Students in 2026'
    const slug = buildSlug(long)
    expect(slug.length).toBeLessThanOrEqual(73) // 70 + possible trailing '-'
    expect(slug.startsWith('comprehensive-step-step-guide')).toBe(true)
    // Should not end with a cut-off word — trimmed at word boundary
    expect(slug.endsWith('-')).toBe(false)
  })

  it('allows slugs up to ~70 chars without truncation', () => {
    const title = 'A ' + 'x'.repeat(55)
    const slug = buildSlug(title)
    expect(slug.length).toBeLessThanOrEqual(70)
    expect(slug).toBe('x'.repeat(55))
  })

  it('falls back to a UUID when the input produces an empty slug', () => {
    const uuid = buildSlug('a the and of for')
    // UUIDs are 36 chars long (8-4-4-4-12)
    expect(uuid.length).toBe(36)
  })

  it('collapses multiple dashes', () => {
    expect(buildSlug('Hello   World---Test')).toBe('hello-world-test')
  })

  it('trims leading and trailing dashes', () => {
    expect(buildSlug('--Hello World--')).toBe('hello-world')
  })

  it('handles empty input gracefully', () => {
    const result = buildSlug('')
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('handles strings with only stop words gracefully', () => {
    const result = buildSlug('a an the of for to in on and or is are be')
    expect(result.length).toBeGreaterThanOrEqual(1) // falls back to UUID
  })

  it('handles mixed punctuation and special characters', () => {
    expect(buildSlug('Visa & Immigration Services - 2026!')).toBe('visa-immigration-services-2026')
  })
})

// ────────────────────────────────────────────────────────────
// buildUniqueSlug
// ────────────────────────────────────────────────────────────

describe('buildUniqueSlug', () => {
  it('returns the base slug when no collision exists', async () => {
    const db = mockDb(['other-gig', 'something-else'])
    const slug = await buildUniqueSlug(db, 'Draft Education Petitions')
    expect(slug).toBe('draft-education-petitions')
  })

  it('appends -2 when the base slug already exists', async () => {
    const db = mockDb(['draft-education-petitions'])
    const slug = await buildUniqueSlug(db, 'Draft Education Petitions')
    expect(slug).toBe('draft-education-petitions-2')
  })

  it('appends -3 when -2 is also taken', async () => {
    const db = mockDb([
      'draft-education-petitions',
      'draft-education-petitions-2',
    ])
    const slug = await buildUniqueSlug(db, 'Draft Education Petitions')
    expect(slug).toBe('draft-education-petitions-3')
  })

  it('skips numeric collisions and finds the first gap', async () => {
    const db = mockDb([
      'draft-education-petitions',
      'draft-education-petitions-2',
      'draft-education-petitions-3',
      'draft-education-petitions-5', // -4 is free
    ])
    const slug = await buildUniqueSlug(db, 'Draft Education Petitions')
    expect(slug).toBe('draft-education-petitions-4')
  })

  it('handles many collisions without error', async () => {
    const taken = ['draft-education-petitions']
    for (let i = 2; i <= 100; i++) {
      taken.push(`draft-education-petitions-${i}`)
    }
    const db = mockDb(taken)
    const slug = await buildUniqueSlug(db, 'Draft Education Petitions')
    expect(slug).toBe('draft-education-petitions-101')
  })

  it('falls back to a short UUID suffix after 999 collisions', async () => {
    const taken = ['draft-education-petitions']
    for (let i = 2; i <= 999; i++) {
      taken.push(`draft-education-petitions-${i}`)
    }
    const db = mockDb(taken)
    const slug = await buildUniqueSlug(db, 'Draft Education Petitions')
    // Should be: 'draft-education-petitions-<6-char-hex>'
    expect(slug).toMatch(/^draft-education-petitions-[a-f0-9]{6}$/)
  })

  it('handles the same slug for different titles correctly', async () => {
    // 'Immigration' → base: 'immigration', which IS in the mock DB → collision
    const db = mockDb(['immigration'])
    const slug1 = await buildUniqueSlug(db, 'Immigration')
    expect(slug1).toBe('immigration-2')

    const db2 = mockDb(['immigration', 'immigration-2'])
    const slug2 = await buildUniqueSlug(db2, 'Immigration')
    expect(slug2).toBe('immigration-3')
  })

  it('uses LIKE prefix matching to catch similar slugs', async () => {
    // buildUniqueSlug uses `like('slug', '${base}%')` so it catches
    // all slugs with the base prefix in a single DB query, then
    // checks exact match against the returned set
    const db = mockDb(['example'])
    const slug = await buildUniqueSlug(db, 'Example')
    expect(slug).toBe('example-2')
  })

  it('properly slugs the title before checking uniqueness', async () => {
    const db = mockDb([])
    const slug = await buildUniqueSlug(db, "Student's Education Guide 2026!")
    expect(slug).toBe('students-education-guide-2026')
  })
})
