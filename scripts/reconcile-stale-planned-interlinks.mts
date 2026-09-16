/**
 * Read-only reconciliation evidence report for `seo_interlinks` rows whose
 * target_url is not the canonical public Marketplace category URL.
 *
 * Canonical public form:
 *   https://market.yousafeconsultancy.com/categories/<valid-id>
 * Known retired forms (recognized safely, never emitted):
 *   https://portal.yousafeconsultancy.com/marketplace/category/<id>    (singular)
 *   https://portal.yousafeconsultancy.com/marketplace/categories/<id>  (plural)
 *
 * Classification and mapping live in scripts/interlinkReconciliation.ts
 * (pure, unit-tested). This executable wrapper is strictly READ-ONLY:
 *   - marketplace_cta rows are fetched with SELECT.
 *   - Canonical rows are evidence/no-op, never candidates.
 *   - Known legacy rows map to the canonical URL only when the id is a real
 *     current category/subcategory AND status='planned' AND the mapped
 *     (source_slug, canonical_target_url) pair is free.
 *   - Malformed/unsupported, invalid-id, query/hash, and non-planned legacy
 *     rows FAIL CLOSED (problem report + non-zero exit, no evidence output).
 *   - Existing-canonical collisions are reported with the stale row id plus
 *     the canonical row id/URL; intra-mapping collisions also fail closed.
 *     Nothing is ever updated, deleted, or merged.
 *   - No INSERT/UPDATE/DELETE/UPSERT/RPC is issued against any table, and no
 *     --apply flag or argv mutation path exists.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reconcile-stale-planned-interlinks.mts
 */
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '../lib/supabaseKey'
import {
  classifyMarketplaceCtaRows,
  type InterlinkReconcileRow,
  type MarketplaceCtaReconciliation,
} from './interlinkReconciliation'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = resolveSupabaseKey()
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const COLLISION_QUERY_CHUNK = 50

/** SELECT every marketplace_cta row — status is classified, not filtered. */
async function fetchMarketplaceCtaRows(): Promise<InterlinkReconcileRow[]> {
  const { data, error } = await supabase
    .from('seo_interlinks')
    .select('id, source_slug, target_url, status')
    .eq('reason', 'marketplace_cta')
    .order('id', { ascending: true })
  if (error) throw new Error(`marketplace_cta query failed: ${error.message}`)
  return (data ?? []) as InterlinkReconcileRow[]
}

/**
 * SELECT any-reason rows already holding a mapped canonical target URL, so
 * cross-reason collisions on the table's (source_slug, target_url) unique
 * constraint are detected too. Chunked to keep PostgREST URLs bounded.
 */
async function fetchRowsHoldingCanonicalTargets(urls: string[]): Promise<InterlinkReconcileRow[]> {
  const out: InterlinkReconcileRow[] = []
  for (let i = 0; i < urls.length; i += COLLISION_QUERY_CHUNK) {
    const chunk = urls.slice(i, i + COLLISION_QUERY_CHUNK)
    const { data, error } = await supabase
      .from('seo_interlinks')
      .select('id, source_slug, target_url, status')
      .in('target_url', chunk)
      .order('id', { ascending: true })
    if (error) throw new Error(`collision query failed: ${error.message}`)
    out.push(...((data ?? []) as InterlinkReconcileRow[]))
  }
  return out
}

function printCounts(result: MarketplaceCtaReconciliation): void {
  console.log(`total_marketplace_cta_rows: ${result.total}`)
  console.log(`canonical_count: ${result.canonicalRows.length}`)
  console.log(`update_safe_count: ${result.updateSafeCandidates.length}`)
  console.log(`existing_canonical_collision_count: ${result.existingCanonicalCollisions.length}`)
  console.log(`intra_mapping_collision_count: ${result.intraMappingCollisions.length}`)
  console.log(`malformed_unsupported_count: ${result.malformedUnsupported.length}`)
  console.log(`non_planned_legacy_count: ${result.nonPlannedLegacy.length}`)
  console.log(`rollback_count: ${result.rollbackMappings.length}`)
}

function printFailClosedProblems(result: MarketplaceCtaReconciliation): void {
  console.error('')
  console.error('FAIL CLOSED — reconciliation evidence withheld:')
  for (const row of result.malformedUnsupported) {
    console.error(`  MALFORMED/UNSUPPORTED ${row.id} ${row.source_slug} [status=${row.status ?? 'null'}] ${row.target_url}`)
  }
  for (const row of result.nonPlannedLegacy) {
    console.error(`  NON-PLANNED LEGACY ${row.id} ${row.source_slug} [status=${row.status ?? 'null'}] ${row.target_url}`)
  }
  for (const collision of result.intraMappingCollisions) {
    console.error(`  INTRA-MAPPING COLLISION ${collision.rowIds.join(' + ')} -> ${collision.sourceSlug} ${collision.canonicalTargetUrl}`)
  }
  console.error('Fix or remove these rows first; this script contains no mutation path.')
}

async function main(): Promise<void> {
  console.log('MODE: READ-ONLY EVIDENCE REPORT')

  const rows = await fetchMarketplaceCtaRows()
  const preliminary = classifyMarketplaceCtaRows(rows)
  const mappedTargets = [
    ...new Set(
      preliminary.rows
        .map((row) => row.canonicalTargetUrl)
        .filter((url): url is string => Boolean(url)),
    ),
  ]
  const existingPairRows = await fetchRowsHoldingCanonicalTargets(mappedTargets)
  const result = classifyMarketplaceCtaRows(rows, existingPairRows)

  printCounts(result)

  if (result.failsClosed) {
    printFailClosedProblems(result)
    process.exit(1)
  }

  if (result.existingCanonicalCollisions.length > 0) {
    console.log('')
    console.log('existing_canonical_collisions (report only — no update/delete/merge; supervisor decides):')
    for (const row of result.existingCanonicalCollisions) {
      console.log(`  · stale ${row.id} (${row.source_slug})`)
      console.log(`      old: ${row.target_url}`)
      console.log(`      canonical already held by ${row.collidesWithRowId}: ${row.canonicalTargetUrl}`)
    }
  }

  console.log('')
  for (const mapping of result.rollbackMappings) {
    console.log(`· ${mapping.staleId} ${mapping.sourceSlug}`)
    console.log(`    old: ${mapping.from}`)
    console.log(`    new: ${mapping.to}`)
  }

  console.log('')
  for (const mapping of result.rollbackMappings) {
    console.log(`ROLLBACK ${mapping.to} -> ${mapping.from}`)
  }

  console.log('')
  console.log('Done — read-only report (no rows were modified; production reconciliation is applied via supervisor SQL)')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
