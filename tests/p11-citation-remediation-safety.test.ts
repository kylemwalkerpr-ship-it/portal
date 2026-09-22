import fs from 'node:fs'
import path from 'node:path'

import {
  buildCitationRemediation,
  buildCitationRemediations,
  needsCitationFix,
} from '@/lib/seoEngine/citationRemediation'
import { buildCitationActions } from '@/lib/seoEngine/llmVisibility'

const owner = 'https://legal.yousafeconsultancy.com/ca/express-entry-document-checklist-2026/'

describe('P11 evidence-driven remediation safety', () => {
  it('refuses content remediation when a measured loss has no authoritative owner', () => {
    expect(needsCitationFix({ query: 'express entry docs', cited: false, shareOfVoice: 0 })).toBe(true)
    expect(buildCitationRemediation({ query: 'express entry docs', cited: false, shareOfVoice: 0 })).toBeNull()
  })

  it('can only target the exact existing authoritative owner and never a new sibling page', () => {
    const item = buildCitationRemediation({
      id: 'audit-1',
      query: 'express entry document checklist',
      cited: false,
      shareOfVoice: 0,
      authoritativeOwnerUrl: owner,
      ownershipRowId: 28,
      topCompetitor: 'canada.ca',
      competitorCitedUrls: ['https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents.html'],
    })
    expect(item).toBeTruthy()
    expect(item!.match.mode).toBe('expand')
    expect(item!.match.url).toBe(owner)
    expect(item!.brief.play).toBe('refresh')
    expect(item!.brief.sourcePage).toBe(owner)
    expect(item!.brief.reason).toMatch(/authoritative owner/i)
    expect(JSON.stringify(item)).not.toMatch(/new canonical|draft one|mode":"new/i)
  })

  it('turns competitor evidence into a research instruction rather than copied claims', () => {
    const item = buildCitationRemediation({
      query: 'express entry document checklist',
      cited: false,
      shareOfVoice: 0,
      authoritativeOwnerUrl: owner,
      ownershipRowId: 28,
      topCompetitor: 'canada.ca',
      competitorCitedUrls: ['https://www.canada.ca/example'],
    })!
    expect(item.actions.some((action) => /research/i.test(action.action) && /canada\.ca/i.test(action.action))).toBe(true)
    expect(item.brief.signals.join(' ')).toContain('https://www.canada.ca/example')
    expect(item.brief.signals.join(' ')).toMatch(/primary source/i)
  })

  it('surfaces wrong/retired estate citations as estate repair rather than content creation', () => {
    const item = buildCitationRemediation({
      query: 'express entry document checklist',
      cited: false,
      shareOfVoice: 0,
      authoritativeOwnerUrl: owner,
      ownershipRowId: 28,
      citationClassifications: [
        { classification: 'wrong_current_owner', normalizedUrl: 'https://legal.yousafeconsultancy.com/ca/other/', rawUrl: 'https://legal.yousafeconsultancy.com/ca/other/' },
        { classification: 'retired_estate_url', normalizedUrl: 'https://portal.yousafeconsultancy.com/marketplace/x/', rawUrl: 'https://portal.yousafeconsultancy.com/marketplace/x/' },
      ],
    })!
    expect(item.actions.some((action) => /estate|canonical|redirect|internal authority/i.test(action.action))).toBe(true)
    expect(item.actions.every((action) => action.actionKind !== 'funnel_new')).toBe(true)
  })

  it('dedupes owner-bound losses and drops every unowned loss', () => {
    const list = buildCitationRemediations([
      { query: 'express entry document checklist', cited: false, shareOfVoice: 0, authoritativeOwnerUrl: owner, ownershipRowId: 28 },
      { query: 'express entry document checklist', cited: false, shareOfVoice: 0, authoritativeOwnerUrl: owner, ownershipRowId: 28 },
      { query: 'unowned topic', cited: false, shareOfVoice: 0 },
    ])
    expect(list).toHaveLength(1)
    expect(list[0].match.url).toBe(owner)
  })

  it('removes generic llms.txt and net-new page prescriptions from the active P11 action generator', () => {
    const actions = buildCitationActions({
      shareOfVoice: 0,
      topCompetitorDomain: 'canada.ca',
      competitorShare: 1,
      cited: false,
    })
    expect(actions.length).toBeGreaterThan(0)
    expect(actions.every((action) => action.actionKind !== 'funnel_new')).toBe(true)
    expect(actions.map((action) => action.action).join(' ')).not.toMatch(/llms\.txt/i)
    expect(actions.map((action) => action.action).join(' ')).not.toMatch(/build .*dedicated|new .*page/i)

    const source = fs.readFileSync(path.join(process.cwd(), 'lib/seoEngine/llmVisibility.ts'), 'utf8')
    const generator = source.slice(source.indexOf('export function buildCitationActions'), source.indexOf('// ── Audit entry points'))
    expect(generator).not.toMatch(/llms\.txt/i)
    expect(generator).not.toMatch(/funnel_new/)
  })
})
