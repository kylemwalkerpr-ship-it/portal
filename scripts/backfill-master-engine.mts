/**
 * Backfill Master SEO Engine scores for every merged job.
 *
 * Runs the layered engine (130+ signals, intent-conditioned weights,
 * competitive deltas, risk gates, prediction) over each merged job's stored
 * content and persists the composite score + full report so the Track stage's
 * Ship Ledger can show the engine grade without re-running on every render.
 *
 * Mirrors scripts/backfill-live-audit.mts:
 *   - `--dry-run` (default) reports only
 *   - `--apply` writes master_engine_score / master_engine_grade /
 *     master_engine_json / master_engine_fetched_at back to content_jobs
 *   - `--limit=N` caps the number of rows processed
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-master-engine.mts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-master-engine.mts --apply
 */
import { createClient } from '@supabase/supabase-js'
import { scoreMaster, type IntentId, type SubsystemId } from '../lib/seoFactory/masterEngine'
import { learnWeights, applyRewardNudges } from '../lib/seoFactory/masterEngineLearn'
import { buildOutcomeHistoryFromLiveGsc } from '../lib/seoFactory/outcomeHistory'
import { jobToMasterEngineInput } from '../lib/seoFactory/jobToMasterInput'
import { resolveSupabaseKey } from '../lib/supabaseKey'
import { loadAllSiteHealthFacts, normalizePageUrl } from '../lib/seoFactory/siteHealthSnapshot'
import { loadLlmVisibilityEvidence } from '../lib/seoEngine/llmVisibility'
import { scoreContentQuality, buildContentLane1, contentQualityPersist } from '../lib/seoFactory/contentQuality'
import { scoreSemanticNlp, buildSemanticLane1, semanticNlpPersist } from '../lib/seoFactory/semanticNlp'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = resolveSupabaseKey()
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const APPLY = args.has('--apply')
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : null

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface JobRow {
  id: string
  title: string | null
  topic: string | null
  primary_keyword: string | null
  content_type: string | null
  region: string | null
  content: string | null
  indexable: boolean | null
  canonical_url: string | null
  live_http_status: number | null
  required_short_keywords: string[] | null
  required_long_tail_keywords: string[] | null
  competing_urls: string[] | null
  competing_snippets: string[] | null
  gsc_json: Record<string, unknown> | null
  backlinks_json: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
  master_engine_score: number | null
  master_engine_grade: string | null
  content_scored_at: string | null
  content_quality_score: number | null
  content_gap_missing_subtopics: string[] | null
  content_top_competitor: string | null
  content_top_competitor_depth: number | null
  content_confidence_avg: number | null
  semantic_scored_at: string | null
  semantic_coverage_score: number | null
  semantic_missing_entities: string[] | null
  semantic_top_competitor: string | null
  semantic_top_competitor_coverage: number | null
  semantic_confidence_avg: number | null
  semantic_flags: string[] | null
}

async function fetchJobs(): Promise<JobRow[]> {
  const PAGE = 1000
  const rows: JobRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('content_jobs')
      .select(`
        id, title, topic, primary_keyword, content_type, region, content,
        indexable, canonical_url, live_http_status,
        required_short_keywords, required_long_tail_keywords,
        competing_urls, competing_snippets, gsc_json, backlinks_json,
        created_at, updated_at,
        master_engine_score, master_engine_grade,
        content_scored_at, content_quality_score, content_gap_missing_subtopics,
        content_top_competitor, content_top_competitor_depth, content_confidence_avg,
        semantic_scored_at, semantic_coverage_score, semantic_missing_entities,
        semantic_top_competitor, semantic_top_competitor_coverage, semantic_confidence_avg,
        semantic_flags
      `)
      .eq('status', 'merged')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`query failed: ${error.message}`)
    const chunk = (data ?? []) as JobRow[]
    rows.push(...chunk)
    if (chunk.length < PAGE) break
    if (LIMIT && rows.length >= LIMIT) break
  }
  return LIMIT ? rows.slice(0, LIMIT) : rows
}

async function main() {
  const rows = await fetchJobs()
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — ${rows.length} merged job(s)\n`)

  // ── Adaptive layer ────────────────────────────────────────────────────
  // Learn per-intent weights from live GSC outcomes correlated against each
  // merged job's stored engine report, then layer the per-publish reward
  // nudge on top. When GSC is unreachable this degrades to an empty history
  // and the engine keeps the fixed intent priors (usedLearned: false).
  const outcome = await buildOutcomeHistoryFromLiveGsc({ days: 28 })
  const learn = outcome.history.length ? learnWeights(outcome.history) : null
  const byIntent: Partial<Record<IntentId, Record<SubsystemId, number>>> = {}
  let nudgeCount = 0
  if (learn) {
    const nudged = applyRewardNudges(learn, outcome.history)
    Object.assign(byIntent, nudged.byIntent)
    nudgeCount = nudged.nudges.length
  }
  console.log(
    `Adaptation: ${outcome.source} · ${outcome.matchedJobs} outcome(s) · ` +
      `${learn?.models.length ?? 0} learned intent(s) · ${nudgeCount} nudged`,
  )
  if (outcome.warnings.length) console.log(`  ⚠ ${outcome.warnings.join(' · ')}`)
  console.log('')

  const grades: Record<string, number> = {}
  let scored = 0
  let skipped = 0
  let wrote = 0
  let updated = 0
  let adapted = 0
  let siteHealthFed = 0
  let llmFed = 0
  let contentScored = 0
  let contentSkipped = 0
  let semanticScored = 0
  let semanticSkipped = 0

  // ── Site Health feed ──────────────────────────────────────────────
  // Load the persisted Operations audit once and attach per-page facts so the
  // technical + links signals reflect the estate scan (orphan / noindex /
  // sitemap / crawl depth / thin) instead of draft-only proxies.
  const siteHealthFacts = await loadAllSiteHealthFacts()

  for (const row of rows) {
    const label = (row.title || row.topic || 'untitled').slice(0, 60)

    const input = jobToMasterEngineInput(row)
    const shUrl = input.liveUrl || input.canonicalUrl || ''
    const facts = shUrl ? siteHealthFacts.get(normalizePageUrl(shUrl)) : undefined
    if (facts) {
      input.siteHealth = {
        orphan: facts.orphan,
        inboundLinks: facts.inboundLinks,
        inSitemap: facts.inSitemap ?? undefined,
        noindex: facts.noindex,
        indexable: facts.indexable,
        crawlDepth: facts.crawlDepth,
        words: facts.words,
      }
      siteHealthFed++
    }

    // LLM/AEO feed — measured multi-engine share-of-voice for this topic.
    const llmV = await loadLlmVisibilityEvidence(input.primaryKeyword || input.topic)
    if (llmV) {
      input.llmVisibility = llmV
      llmFed++
    }

    // Content Quality module (Subsystem A) — one well-scoped LLM judgment
    // call per job, skipped within its 7-day TTL so re-runs don't re-spend.
    // Apply-mode only: dry-run must not spend tokens.
    let contentCols: Record<string, unknown> | null = null
    if (APPLY) {
      const fresh = row.content_scored_at &&
        Date.now() - new Date(row.content_scored_at).getTime() < 7 * 86_400_000
      if (!fresh) {
        const lane1 = buildContentLane1({
          targetText: input.content || '',
          competitorTexts: row.competing_snippets || [],
          competingInternalUrls: input.competingUrls || [],
        })
        const cq = await scoreContentQuality({
          pageUrl: input.liveUrl || input.canonicalUrl || '',
          targetText: input.content || '',
          competitorTexts: row.competing_snippets || [],
          lane1,
        })
        if (cq.model_used !== 'unavailable' || cq.variables.length) {
          const persisted = contentQualityPersist(cq)
          contentCols = { ...persisted, content_scored_at: new Date().toISOString() }
          input.contentQuality = persisted.content_quality_score != null
            ? {
                score: persisted.content_quality_score,
                confidence: persisted.content_confidence_avg,
                missingSubtopics: persisted.content_gap_missing_subtopics,
                topCompetitorUrl: persisted.content_top_competitor,
                topCompetitorDepthScore: persisted.content_top_competitor_depth,
              }
            : undefined
          contentScored++
        }
      } else {
        contentSkipped++
      }
    }

    // Semantic/NLP module (Subsystem H) — one well-scoped LLM judgment call
    // per job, skipped within its 7-day TTL. Apply-mode only.
    let semanticCols: Record<string, unknown> | null = null
    if (APPLY) {
      const fresh = row.semantic_scored_at &&
        Date.now() - new Date(row.semantic_scored_at).getTime() < 7 * 86_400_000
      if (!fresh) {
        const lane1 = buildSemanticLane1({
          questionIntent: input.contentType === 'faq' || /\?/.test(input.topic || ''),
        })
        const sem = await scoreSemanticNlp({
          pageUrl: input.liveUrl || input.canonicalUrl || '',
          targetText: input.content || '',
          competitorTexts: row.competing_snippets || [],
          lane1,
        })
        if (sem.model_used !== 'unavailable' || sem.variables.length) {
          const persisted = semanticNlpPersist(sem)
          semanticCols = { ...persisted, semantic_scored_at: new Date().toISOString() }
          input.semanticNlp = persisted.semantic_coverage_score != null
            ? {
                score: persisted.semantic_coverage_score,
                confidence: persisted.semantic_confidence_avg,
                missingEntities: persisted.semantic_missing_entities,
                topCompetitorUrl: persisted.semantic_top_competitor,
                topCompetitorEntityCoverage: persisted.semantic_top_competitor_coverage,
                flags: persisted.semantic_flags,
              }
            : undefined
          semanticScored++
        }
      } else {
        semanticSkipped++
      }
    }

    // Skip rows that already carry a score from the same engine era? No —
    // this is a raise/replace backfill: score every merged job and refresh.
    const report = scoreMaster(input, { byIntent })
    if (report.composite == null) {
      skipped++
      console.log(`  · skipped       ${row.id.slice(0, 8)}…  no computable composite · ${label}`)
      continue
    }
    scored++
    if (report.adaptation.usedLearned) adapted++
    grades[report.grade ?? '?'] = (grades[report.grade ?? '?'] ?? 0) + 1

    const already = row.master_engine_score
    const delta = already == null ? '' : ` (was ${already})`
    console.log(
      `  ${report.grade} ${String(report.composite).padStart(3)}/100  ${row.id.slice(0, 8)}…  ${report.intentLabel}  coverage ${report.coverage.pct}%${delta} · ${label}`,
    )

    if (APPLY) {
      const { error } = await supabase
        .from('content_jobs')
        .update({
          master_engine_score: report.composite,
          master_engine_grade: report.grade,
          master_engine_json: report,
          master_engine_fetched_at: report.generatedAt,
          ...(contentCols || {}),
          ...(semanticCols || {}),
        })
        .eq('id', row.id)
      if (error) {
        console.error(`    ✗ update failed: ${error.message}`)
      } else {
        wrote++
        if (already != null) updated++
      }
    }
  }

  console.log('\n── Summary ──────────────────────────────────────────')
  console.log(`  Rows scanned:      ${rows.length}`)
  console.log(`  Scored:            ${scored}`)
  console.log(`  Skipped:           ${skipped} (no computable composite)`)
  console.log(`  Site Health fed:   ${siteHealthFed}`)
  console.log(`  LLM voice fed:     ${llmFed}`)
  console.log(`  Content scored:    ${contentScored} (${contentSkipped} within TTL)`)
  console.log(`  Semantic scored:   ${semanticScored} (${semanticSkipped} within TTL)`)
  console.log(`  Adapted (learned): ${adapted}`)
  const gradeLine = Object.entries(grades)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([g, n]) => `${g}:${n}`)
    .join(' · ')
  console.log(`  Grades:            ${gradeLine || '—'}`)
  if (APPLY) {
    console.log(`  Wrote:             ${wrote} (${updated} refreshed)`)
  } else {
    console.log('\n  Re-run with --apply to write master_engine_* back to content_jobs.')
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
