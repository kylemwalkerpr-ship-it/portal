/**
 * One-off: repair CA CRS job c72d74c4 — overwrite off-estate IQAS canonical,
 * run deterministic repairs + audit, persist draft (no Approve/ship).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/repair-ca-crs-canonical.mts --dry-run
 *   npx tsx --env-file=.env.local scripts/repair-ca-crs-canonical.mts --apply
 */
import { createClient } from '@supabase/supabase-js'
import { applyDeterministicRepairs } from '../lib/seoFactory/editorialScaffold'
import { auditContent } from '../lib/seoFactory/audit'
import { resolveOwner } from '../lib/seoFactory/ownership'
import { resolveSupabaseKey } from '../lib/supabaseKey'

const JOB_ID = 'c72d74c4-f70e-4a3e-bb77-1156e6baffab'
const APPLY = process.argv.includes('--apply')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = resolveSupabaseKey()
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env')
  process.exit(1)
}
const sb = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const { data, error } = await sb.from('content_jobs').select('*').eq('id', JOB_ID).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('job not found')

  const row = data as Record<string, unknown>
  const contentType = String(row.content_type || 'regional_page')
  const region = String(row.region || 'CA')
  const primaryKeyword = String(row.primary_keyword || row.topic || '')
  const title = String(row.title || primaryKeyword)
  const plan = await resolveOwner({ primaryKeyword, contentType, region })

  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} job ${JOB_ID}`)
  console.log('plan.canonicalUrl', plan.canonicalUrl)
  console.log('plan.filePath', plan.filePath)
  console.log('old seo_score', row.seo_score)
  console.log('old FM canonical', String(row.content || '').match(/^canonicalUrl:\s*(.+)$/m)?.[1])

  const repaired = applyDeterministicRepairs({
    content: String(row.content || ''),
    title,
    primaryKeyword,
    region,
    indexable: row.indexable !== false,
    contentType,
    requiredShortKeywords: (row.required_short_keywords as string[]) || undefined,
    requiredLongTailKeywords: (row.required_long_tail_keywords as string[]) || undefined,
    targetUrl: plan.canonicalUrl,
  })

  const audit = auditContent({
    content: repaired.content,
    contentType,
    primaryKeyword,
    indexable: row.indexable !== false,
    requiredShortKeywords: (row.required_short_keywords as string[]) || undefined,
    requiredLongTailKeywords: (row.required_long_tail_keywords as string[]) || undefined,
  })

  console.log('applied', repaired.applied.slice(0, 20))
  console.log('new FM canonical', repaired.content.match(/^canonicalUrl:\s*(.+)$/m)?.[1])
  console.log('new seo_score', audit.score, audit.grade)
  console.log('blockers', audit.blockers.map((b) => b.code))
  console.log('warnings', audit.warnings.map((w) => w.code).slice(0, 12))
  console.log('has alberta?', /alberta\.ca/i.test(repaired.content))

  if (!APPLY) {
    console.log('Dry-run only — re-run with --apply to persist (no Approve).')
    return
  }

  const prevAudit = (row.audit_json && typeof row.audit_json === 'object'
    ? (row.audit_json as Record<string, unknown>)
    : {}) as Record<string, unknown>
  const audit_json = {
    ...prevAudit,
    grade: audit.grade,
    score: audit.score,
    passes: audit.passes,
    blockers: audit.blockers,
    warnings: audit.warnings,
    wordCount: audit.wordCount,
    humanScore: audit.humanScore,
    primaryKeyword,
    qualitySummary: audit.qualitySummary,
    llmsRecommended: audit.llmsRecommended,
    indexableRecommended: audit.indexableRecommended,
    // Preserve any prior shipReady if present; do not invent Approve.
  }

  const patch: Record<string, unknown> = {
    content: repaired.content,
    seo_score: audit.score,
    word_count: audit.wordCount,
    canonical_url: plan.canonicalUrl,
    content_path: plan.filePath,
    owner_host: plan.host,
    target_repo: plan.repo,
    audit_json,
    updated_at: new Date().toISOString(),
  }

  const { error: upErr } = await sb.from('content_jobs').update(patch).eq('id', JOB_ID)
  if (upErr) throw new Error(upErr.message)
  console.log('Persisted draft repair — status unchanged; Approve NOT run.')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
