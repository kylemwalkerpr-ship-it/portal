import {
  buildPortablePlaybookPromptBlock,
  getPlaybookManifest,
  getPortableWeek,
  PLAYBOOK_ID,
  PLAYBOOK_VERSION,
  PORTABLE_PROMPTS,
  PORTABLE_WEEKS,
} from '@/lib/seoFactory/portableSeoPlaybook'

describe('portable SEO playbook manifest', () => {
  it('has 6 weeks with the sprint fields wired', () => {
    const manifest = getPlaybookManifest()
    expect(manifest.weeks).toHaveLength(6)
    expect(PORTABLE_WEEKS).toHaveLength(6)
    expect(manifest.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5, 6])
    for (const w of manifest.weeks) {
      expect(w.title).toBeTruthy()
      expect(w.stages.length).toBeGreaterThan(0)
      expect(w.focus).toBeTruthy()
      expect(w.doneWhen).toBeTruthy()
      expect(w.preferredSignals.length).toBeGreaterThan(0)
    }
  })

  it('has prompts P0 through P12 with studio stages', () => {
    const manifest = getPlaybookManifest()
    expect(PORTABLE_PROMPTS).toHaveLength(13)
    expect(manifest.prompts).toHaveLength(13)
    expect(manifest.prompts[0].id).toBe('P0')
    expect(manifest.prompts[12].id).toBe('P12')
    const ids = manifest.prompts.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of manifest.prompts) {
      expect(p.title).toBeTruthy()
      expect(p.body).toBeTruthy()
      expect(p.studioStages.length).toBeGreaterThan(0)
    }
    expect(manifest.id).toBe(PLAYBOOK_ID)
    expect(manifest.version).toBe(PLAYBOOK_VERSION)
  })
})

describe('buildPortablePlaybookPromptBlock', () => {
  it('includes YMYL / update-on-owner / no Map Pack directives', () => {
    const block = buildPortablePlaybookPromptBlock()
    expect(block).toContain('PORTABLE SEO PLAYBOOK')
    expect(block).toContain('update-on-owner')
    expect(block).toContain('YMYL')
    expect(block).toContain('no GBP / Map Pack tactics')
    expect(block).toContain('Approve gates')
  })

  it('honors the week filter and swaps the sprint detail', () => {
    const w2 = buildPortablePlaybookPromptBlock({ week: 2 })
    const w5 = buildPortablePlaybookPromptBlock({ week: 5 })
    expect(w2).toContain('This week (2')
    expect(w2).toContain('top 10 goldmine rows')
    expect(w5).toContain('This week (5')
    expect(w5).toContain('Support Triage patterns')
    expect(w2).not.toContain('Support Triage patterns')
  })

  it('falls back to the cadence line for an out-of-range week', () => {
    const block = buildPortablePlaybookPromptBlock({ week: 9 })
    expect(block).toContain('Cadence:')
    expect(block).not.toContain('This week (')
    expect(getPortableWeek(1)?.week).toBe(1)
    expect(getPortableWeek(6)?.week).toBe(6)
    expect(getPortableWeek(7)).toBeNull()
  })

  it('surfaces region and intent scope when provided', () => {
    const block = buildPortablePlaybookPromptBlock({ week: 4, region: 'US', intent: 'marriage green card' })
    expect(block).toContain('region US')
    expect(block).toContain('intent marriage green card')
  })
})