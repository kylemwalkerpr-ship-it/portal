import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  StudioLiveDesk,
  ageLabel,
  resolveDeskFreshness,
} from '@/components/design/studio-live-desk'
import type { ContentJob, QueueSummary } from '@/components/design/studio-ui-shared'

function job(partial: Partial<ContentJob> & Pick<ContentJob, 'id' | 'title' | 'status'>): ContentJob {
  return {
    id: partial.id,
    title: partial.title,
    topic: partial.topic || partial.title,
    content_type: 'article',
    tone: 'educational',
    region: 'US',
    target_repo: 'caseworks',
    status: partial.status,
    source_job_id: null,
    slug: 'x',
    content: null,
    branch_name: null,
    content_path: null,
    pr_url: null,
    pr_number: null,
    merged_at: null,
    closed_at: null,
    error_message: null,
    ai_provider: 'grok',
    word_count: 2200,
    seo_score: 80,
    created_at: '2026-08-17T10:00:00.000Z',
    updated_at: '2026-08-17T11:00:00.000Z',
    ...partial,
  }
}

const summary: QueueSummary = {
  total: 221,
  pending: 2,
  drafting: 8,
  publishing: 1,
  pr_created: 0,
  merged: 37,
  failed: 40,
}

const engine = {
  fetchedAt: '2026-08-17T11:14:00.000Z',
  lifecycle: { seededCells: 36 },
  knowledge: { total: 66, latestTitle: 'USCIS news', latestAt: '2026-08-17T10:00:00.000Z' },
  plans: { total: 12, latestTerm: 'education verification', latestAt: '2026-08-17T10:05:00.000Z' },
  interlinks: { planned: 180, applied: 34, latestAt: '2026-08-17T10:06:00.000Z' },
  llmVisibility: { total: 6, cited: 0, shareOfVoice: 0 },
  rankingModel: { computed: 26, latestTotal: 26, latestTopic: 'f1 visa' },
  gate: { runs: 0, passed: 0, passRate: 0, avgScore: 0 },
  runs: [
    { kind: 'daily', status: 'partial', started_at: '2026-08-17T10:00:00.000Z', summary: { knowledge: 12, plans: 10 } },
  ],
}

const drafting = job({ id: 'j-edu', title: 'Complete Guide: Education Verification Service 2026', status: 'drafting' })

function render(extra: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(StudioLiveDesk, {
      summary,
      jobs: [drafting, job({ id: 'j-fail', title: 'Boundless vs Immigration Lawyer', status: 'failed' })],
      generating: false,
      engine,
      engineAt: Date.now(),
      engineBusy: false,
      engineAction: null,
      engineElapsed: 0,
      engineTrace: [],
      liveState: 'live',
      onIngest: () => undefined,
      onPlan: () => undefined,
      onLlm: () => undefined,
      ...extra,
    }),
  )
}

describe('ageLabel / resolveDeskFreshness', () => {
  it('formats relative ages', () => {
    const now = Date.parse('2026-08-17T11:00:10.000Z')
    expect(ageLabel(now - 2000, now)).toBe('just now')
    expect(ageLabel(now - 12_000, now)).toBe('12s ago')
    expect(ageLabel(now - 180_000, now)).toBe('3m ago')
    expect(ageLabel(null, now)).toBe('—')
  })

  it('marks a desk stale after 45s without a poll', () => {
    const now = 1_000_000
    expect(resolveDeskFreshness(now - 10_000, now)).toBe('live')
    expect(resolveDeskFreshness(now - 50_000, now)).toBe('stale')
    expect(resolveDeskFreshness(null, now)).toBe('connecting')
  })
})

describe('StudioLiveDesk — live floor board', () => {
  it('renders the copy-desk contract and exact engine counts', () => {
    const html = render()
    expect(html).toContain('data-testid="studio-live-desk"')
    expect(html).toContain('COPY DESK')
    expect(html).toContain('NOW ON THE FLOOR')
    expect(html).toContain('MASTER ENGINE · EXACT COUNTS')
    expect(html).toContain('>36<')
    expect(html).toContain('>66<')
    expect(html).toContain('>12<')
    expect(html).toContain('>214<')
    expect(html).toContain('0/6')
    expect(html).toContain('n/a')
    expect(html).toContain('daily · partial')
  })

  it('lists real in-flight and failed jobs instead of only pills', () => {
    const html = render()
    expect(html).toContain('data-testid="desk-slip-j-edu"')
    expect(html).toContain('Complete Guide: Education Verification Service 2026')
    expect(html).toContain('Boundless vs Immigration Lawyer')
    expect(html).toContain('>11<')
    expect(html).toContain('>40<')
  })

  it('shows n/a for LLM and gate when the tables are empty', () => {
    const html = render({
      engine: {
        ...engine,
        llmVisibility: { total: 0, cited: 0, shareOfVoice: 0 },
        gate: { runs: 0, passed: 0, passRate: 0, avgScore: 0 },
      },
    })
    expect(html).toContain('No LLM audits yet')
    expect(html).toContain('No compliance gate runs yet')
  })
})
