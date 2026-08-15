/**
 * Scan stored drafts (content_jobs.content) for sentence_start_repetition
 * that slipped through before the gate counted list items (bullets, FAQ
 * answers) and before the deterministic rhythm repair existed.
 *
 * Usage: npx tsx --env-file=.env.local scripts/scan-draft-rhythm.mts
 * Outputs a per-draft report + summary. Read-only against Supabase.
 */
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '../lib/supabaseKey'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
// resolveSupabaseKey(): the new-format service secret (sb_secret_…) may not be
// accepted by supabase-js for this project, so fall back to the anon key — the
// RLS policy on content_jobs is open (USING true), so reads work either way.
const supabaseKey = resolveSupabaseKey()
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)')
  process.exit(1)
}
const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * Use the REAL gate detector (evaluateContentQuality) so the scan can never
 * drift from the shipped audit — including the URL-line exclusion that keeps
 * gov.uk sources lists from false-flagging sentence_start_repetition.
 */
import { evaluateContentQuality } from '../lib/seoFactory/contentQualityGate'

function detectRhythm(body: string): { key: string; count: number } | null {
  const gate = evaluateContentQuality({
    content: body,
    contentType: 'article',
    primaryKeyword: '',
    title: '',
    region: '',
    indexable: true,
  })
  const hit = [...gate.blockers, ...gate.warnings].find((f) => f.code === 'sentence_start_repetition')
  if (!hit) return null
  const count = Number((hit.message.match(/(\d+)×/) || [])[1]) || 5
  return { key: String(hit.evidence || '?'), count }
}

const stripForScan = (content: string) =>
  String(content || '')
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')

async function main() {
  const { data, error } = await supabase
    .from('content_jobs')
    .select('id, title, status, content_type, region, content, updated_at')
    .not('content', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(500)
  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }
  const rows = data || []
  console.log(`Scanned ${rows.length} stored drafts (latest 500 with content)\n`)

  let flagged = 0
  const genuine: Array<{ id: string; title: string; status: string; type: string; key: string; count: number }> = []
  const artifacts: Array<{ id: string; title: string; status: string; kind: string; key: string; count: number }> = []
  for (const row of rows) {
    const content = row.content || ''
    const hit = detectRhythm(stripForScan(content))
    if (!hit) continue
    flagged++
    const meta = {
      id: row.id,
      title: (row.title || 'untitled').slice(0, 60),
      status: row.status,
      key: hit.key,
      count: hit.count,
    }
    // HTML-stored drafts (rich-text export) and URL source lists are NOT
    // robotic prose rhythm — separate them so the report is actionable.
    if (/<[a-z][a-z0-9]*\s|https?:\/\//i.test(content.slice(0, 2000))) {
      artifacts.push({
        ...meta,
        type: row.content_type,
        kind: /<[a-z][a-z0-9]*\s/i.test(content.slice(0, 2000)) ? 'html-format' : 'url-links',
      })
    } else if (/^https?:\/\//i.test(hit.key)) {
      artifacts.push({ ...meta, type: row.content_type, kind: 'url-links' })
    } else {
      genuine.push({ ...meta, type: row.content_type })
    }
  }

  console.log(`FLAGGED: ${flagged}/${rows.length} drafts match the rhythm detector`)
  console.log(`  Genuine prose rhythm (needs Re-audit): ${genuine.length}`)
  console.log(`  Artifacts (HTML format / URL lists):  ${artifacts.length}\n`)
  console.log('── GENUINE prose-rhythm hits ──')
  for (const f of genuine) {
    console.log(`  [${f.status}] ${f.id} · ${f.type} · "${f.key}…" ×${f.count} · ${f.title}`)
  }
  if (artifacts.length) {
    console.log(`\n── Artifacts (${artifacts.length}, not rhythm issues) ──`)
    for (const f of artifacts.slice(0, 15)) {
      console.log(`  [${f.status}] ${f.id} · ${f.kind} · "${f.key}…" ×${f.count} · ${f.title}`)
    }
    if (artifacts.length > 15) console.log(`  …and ${artifacts.length - 15} more artifacts`)
  }
  console.log(`\nSummary: ${genuine.length} drafts need a Re-audit / Fix-all-warnings to clear rhythm.`)
  console.log('Remediation: open each in the Draft stage → click Re-audit (smoothSentenceRhythm now runs there).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
