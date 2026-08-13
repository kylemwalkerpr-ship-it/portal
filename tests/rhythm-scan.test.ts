/**
 * Weekly rhythm-scan engine — regression suite.
 * Locks the guarantees the dashboard depends on:
 *  1. Detection uses the REAL gate (sentence_start_repetition), not a drift-prone copy.
 *  2. HTML/TSX-exported drafts (not markdown prose) are skipped so the alert
 *     list never floods with "<p>" prefix false positives.
 *  3. remediable=true only when the deterministic repair fully clears the warning.
 *  4. Alerts persist one row per job per run (unique job_id+run_ts).
 */
import { runRhythmScan, listRhythmAlerts } from '@/lib/seoFactory/rhythmScan'

// ── Supabase fake ─────────────────────────────────────────────────────
type Row = Record<string, unknown>
type TableName = 'content_jobs' | 'content_rhythm_alerts' | 'mission_log'

function makeClient(opts: {
  rows?: Row[]
  alertRows?: Row[]
  insertErrors?: Record<string, string>
}) {
  const inserted: Record<string, Row[]> = {}
  // A thenable whose chain methods (select/not/order/limit) resolve to the
  // same promised result, and whose insert() records rows per table.
  function chain(table: TableName) {
    const result = table === 'content_jobs'
      ? { data: opts.rows ?? null, error: null }
      : { data: table === 'content_rhythm_alerts' ? opts.alertRows ?? null : null, error: null }
    const p: any = Promise.resolve(result)
    p.select = () => p
    p.not = () => p
    p.order = () => p
    p.limit = () => p
    p.insert = (rows: Row[]) => {
      // Supabase accepts a single row object OR an array. Normalize so the
      // mission_log single-object insert records too.
      const arr = Array.isArray(rows) ? rows : [rows]
      if (!inserted[table]) inserted[table] = []
      inserted[table].push(...arr)
      return { error: opts.insertErrors?.[table] ? { message: opts.insertErrors[table] } : null }
    }
    return p
  }
  return {
    from(table: string) {
      return chain(table as TableName)
    },
    inserted,
  }
}

jest.mock('@/lib/supabase', () => ({
  createSupabaseAdminClient: () => (global as any).__rhythmClient,
}))

const FRONT = `---
title: "UK dependent visa guide 2026"
content_type: article
primaryKeyword: uk dependent visa
---

`
const prose = (body: string) => FRONT + body

function roboticBullets(count: number): string {
  const bullets = Array.from({ length: count }, (_, i) => {
    const tails = [
      'allows partners to apply for the same stay.',
      'requires proof of the relationship.',
      'covers children under 18.',
      'is applied for online.',
      'normally takes three weeks to process.',
      'does not grant access to public funds.',
      'can be extended from inside the UK.',
      'needs a valid passport and biometrics.',
    ]
    return `- The UK dependent visa ${tails[i % tails.length]}`
  })
  // ≥8 sentences total: the gate only runs the rhythm check at that floor.
  return prose(`# UK dependent visa guide\n\n## In 60 seconds\n${bullets.join('\n')}\n\nYou need a clear document set before you file. Processing times change and you verify the current rules on the official site before applying. Supporting evidence must match the application. Check the official guidance before you submit anything.`)
}

const PLAIN_GOOD = prose(
  `# Student visa documents\n\n## In 60 seconds\n- Confirm the exact form list on the official site\n- Gather bank statements before you file\n- Check processing times so you do not miss a deadline\n\nYou need a clear document set before you file. Processing times change and you verify the current rules on the official site before applying.`,
)

const HTML_DRAFT = `<p>\n        The UK dependent visa allows partners to apply.\n      </p>\n      <p>\n        The UK dependent visa requires proof of the relationship.\n      </p>\n      <p>\n        The UK dependent visa covers children under 18.\n      </p>\n      <p>\n        The UK dependent visa is applied for online.\n      </p>\n      <p>\n        The UK dependent visa normally takes three weeks.\n      </p>`

const TSX_DRAFT = `import ArticleLayout from "@/components/ArticleLayout";\nimport Link from "next/link";\nexport const metadata = { title: "UK dependent visa guide" };\n\nexport default function Page() {\n  return <article><h1>UK dependent visa</h1><p>The UK dependent visa allows partners to apply.</p></article>\n}`

describe('runRhythmScan', () => {
  beforeEach(() => {
    ;(global as any).__rhythmClient = makeClient({ rows: [] })
  })

  it('flags robotic bullets with the real gate and marks remediable when repair clears it', async () => {
    const client = makeClient({
      rows: [
        { id: 'j1', title: 'UK dependent visa guide', status: 'drafting', content_type: 'article', region: 'UK', primary_keyword: 'uk dependent visa', content: roboticBullets(5) },
      ],
    })
    ;(global as any).__rhythmClient = client
    const result = await runRhythmScan({ limit: 10 })
    expect(result.scanned).toBe(1)
    expect(result.flagged).toBe(1)
    expect(result.alerts[0].job_id).toBe('j1')
    expect(result.alerts[0].rhythm_key).toContain('the uk depen')
    expect(result.alerts[0].remediable).toBe(true)
    // one alert row persisted for the run
    expect(client.inserted['content_rhythm_alerts']).toHaveLength(1)
    expect(client.inserted['mission_log']).toHaveLength(1)
  })

  it('marks extreme repetition non-remediable (deterministic repair cannot fully clear)', async () => {
    const client = makeClient({
      rows: [
        { id: 'j2', title: '485 visa english requirements', status: 'failed', content_type: 'article', region: 'AU', primary_keyword: '485 visa english', content: roboticBullets(26) },
      ],
    })
    ;(global as any).__rhythmClient = client
    const result = await runRhythmScan({ limit: 10 })
    expect(result.flagged).toBe(1)
    expect(result.alerts[0].count).toBeGreaterThanOrEqual(5)
    // 26x is beyond the pronoun-rotation cap → not a one-click fix
    expect(result.alerts[0].remediable).toBe(false)
  })

  it('skips HTML and TSX-exported drafts (not markdown prose rhythm)', async () => {
    const client = makeClient({
      rows: [
        { id: 'j-html', title: 'Paper proofreading service', status: 'drafting', content_type: 'article', content: HTML_DRAFT },
        { id: 'j-tsx', title: 'UK dependent visa guide', status: 'drafting', content_type: 'article', content: TSX_DRAFT },
        { id: 'j-good', title: 'Student visa documents', status: 'review', content_type: 'article', content: PLAIN_GOOD },
      ],
    })
    ;(global as any).__rhythmClient = client
    const result = await runRhythmScan({ limit: 10 })
    expect(result.flagged).toBe(0)
    expect(result.alerts).toHaveLength(0)
  })

  it('reports a query error instead of throwing', async () => {
    const failing = {
      from(table: string) {
        if (table === 'content_jobs') {
          const p: any = Promise.resolve({ data: null, error: { message: 'boom' } })
          p.select = () => p; p.not = () => p; p.order = () => p; p.limit = () => p
          p.insert = () => ({ error: null })
          return p
        }
        const q: any = Promise.resolve({ data: null, error: null })
        q.select = () => q; q.not = () => q; q.order = () => q; q.limit = () => q
        q.insert = () => ({ error: null })
        return q
      },
    }
    ;(global as any).__rhythmClient = failing
    const result = await runRhythmScan({ limit: 10 })
    expect(result.scanned).toBe(0)
    expect(result.errors.some((e) => e.includes('boom'))).toBe(true)
  })
})

describe('listRhythmAlerts', () => {
  it('returns latest-run totals and rows', async () => {
    const client = makeClient({
      alertRows: [
        { id: 'a1', job_id: 'j1', title: 'A', rhythm_key: 'the uk depen', count: 5, severity: 'warning', remediable: true, run_ts: '2026-08-20T06:00:00.000Z' },
        { id: 'a2', job_id: 'j2', title: 'B', rhythm_key: 'the departme', count: 26, severity: 'blocker', remediable: false, run_ts: '2026-08-20T06:00:00.000Z' },
        { id: 'a3', job_id: 'j3', title: 'C', rhythm_key: 'the departme', count: 8, severity: 'blocker', remediable: false, run_ts: '2026-08-13T06:00:00.000Z' },
      ],
    })
    ;(global as any).__rhythmClient = client
    const result = await listRhythmAlerts({ limit: 10 })
    expect(result.latestRunTs).toBe('2026-08-20T06:00:00.000Z')
    expect(result.totals.flagged).toBe(2)
    expect(result.totals.remediable).toBe(1)
    expect(result.totals.blockers).toBe(1)
    expect(result.alerts).toHaveLength(3)
  })
})
