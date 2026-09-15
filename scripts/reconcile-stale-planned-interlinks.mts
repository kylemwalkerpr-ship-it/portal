/**
 * Read-only reconciliation evidence report for `seo_interlinks` rows whose
 * target_url still uses the retired Portal-host Marketplace form.
 *
 * Public Marketplace category URLs are
 *   https://market.yousafeconsultancy.com/categories/<id>
 * The retired form
 *   https://portal.yousafeconsultancy.com/marketplace/categories/<id>
 * must never be emitted. The production reconciliation for the 70 stale
 * planned rows was applied atomically by supervisor SQL on 2026-09-15; this
 * script is now strictly READ-ONLY evidence tooling: it queries, validates,
 * maps, and prints rollback evidence. It contains NO update path and accepts
 * no flags that mutate anything.
 *
 * Safety model (fails closed — never guesses):
 *   - READ-ONLY: no INSERT/UPDATE/DELETE is issued against any table.
 *   - Only rows with status='planned' AND target_url beginning with the exact
 *     retired prefix are considered.
 *   - A candidate is valid ONLY if target_url matches, in full:
 *       ^https://portal[.]yousafeconsultancy[.]com/marketplace/categories/[a-z0-9]+(?:-[a-z0-9]+)*$
 *     ANY malformed match-prefix row aborts the report.
 *   - Mapping is a pure prefix replacement that preserves the category id.
 *   - Uniqueness is checked against existing (source_slug, new_target_url)
 *     pairs and within the candidate mapping itself; ANY collision aborts.
 *   - The report prints a full rollback mapping (new -> old) for every row.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/reconcile-stale-planned-interlinks.mts
 */
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '../lib/supabaseKey'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = resolveSupabaseKey()
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + key)')
  process.exit(1)
}

const RETIRED_PREFIX = 'https://portal.yousafeconsultancy.com/marketplace/categories/'
const CANONICAL_PREFIX = 'https://market.yousafeconsultancy.com/categories/'
const VALID_TARGET_RE =
  /^https:\/\/portal[.]yousafeconsultancy[.]com\/marketplace\/categories\/[a-z0-9]+(?:-[a-z0-9]+)*$/

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface InterlinkRow {
  id: string
  source_slug: string
  target_url: string
  status: string | null
}

interface Reconciliation {
  id: string
  source_slug: string
  old_target_url: string
  new_target_url: string
}

function newUrlFor(oldUrl: string): string {
  return CANONICAL_PREFIX + oldUrl.slice(RETIRED_PREFIX.length)
}

/** Fetch planned rows whose target_url starts with the exact retired prefix. */
async function fetchStalePlanned(): Promise<InterlinkRow[]> {
  const { data, error } = await supabase
    .from('seo_interlinks')
    .select('id, source_slug, target_url, status')
    .eq('status', 'planned')
    .like('target_url', `${RETIRED_PREFIX}%`)
    .order('id', { ascending: true })
  if (error) throw new Error(`stale planned query failed: ${error.message}`)
  return (data ?? []) as InterlinkRow[]
}

/** Fail closed when ANY match-prefix row is malformed (non-category target). */
function validate(rows: InterlinkRow[]): InterlinkRow[] {
  const malformed = rows.filter((r) => !VALID_TARGET_RE.test(r.target_url))
  if (malformed.length > 0) {
    console.error(`FAIL CLOSED — ${malformed.length} malformed target_url(s) among match-prefix rows:`)
    for (const r of malformed) {
      console.error(`  ${r.id} ${r.source_slug} ${r.target_url}`)
    }
    console.error('No reconciliation evidence is produced while any malformed target exists. Fix or remove these rows first.')
    process.exit(1)
  }
  return rows
}

/**
 * Fail closed when the candidate mapping itself is not injective per
 * (source_slug, new_target_url): two candidate rows reconciling to the same
 * (source_slug, new_target_url) pair would collide with each other on the
 * table's unique constraint.
 */
function assertNoIntraMappingCollisions(recons: Reconciliation[]): void {
  const seen = new Map<string, string>()
  const intra: string[] = []
  for (const r of recons) {
    const key = `${r.source_slug}\u0000${r.new_target_url}`
    const first = seen.get(key)
    if (first !== undefined) {
      intra.push(`${first} + ${r.id} -> ${r.source_slug} ${r.new_target_url}`)
    } else {
      seen.set(key, r.id)
    }
  }
  if (intra.length > 0) {
    console.error(`FAIL CLOSED — ${intra.length} intra-mapping collision(s): two candidate rows reconcile to the same (source_slug, new_target_url):`)
    for (const line of intra) {
      console.error(`  ${line}`)
    }
    console.error('No reconciliation evidence is produced while the mapping itself is ambiguous. Deduplicate these candidates first.')
    process.exit(1)
  }
}

/**
 * Fail closed when any row already holds the same (source_slug, new_target_url)
 * pair the reconciliation would produce. The candidate row itself is excluded
 * (its old target_url necessarily differs from its new one); candidate-vs-
 * candidate duplicates are covered by assertNoIntraMappingCollisions.
 */
async function assertNoCollisions(recons: Reconciliation[]): Promise<void> {
  const slugs = [...new Set(recons.map((r) => r.source_slug))]
  const newUrls = [...new Set(recons.map((r) => r.new_target_url))]
  const { data, error } = await supabase
    .from('seo_interlinks')
    .select('id, source_slug, target_url')
    .in('source_slug', slugs)
    .in('target_url', newUrls)
  if (error) throw new Error(`collision query failed: ${error.message}`)

  const existing = (data ?? []) as Array<Pick<InterlinkRow, 'id' | 'source_slug' | 'target_url'>>
  const candidateIds = new Set(recons.map((r) => r.id))
  const collisions = existing.filter(
    (row) => !candidateIds.has(row.id) && recons.some((r) => r.source_slug === row.source_slug && r.new_target_url === row.target_url),
  )
  if (collisions.length > 0) {
    console.error(`FAIL CLOSED — ${collisions.length} collision(s): a row already holds the reconciled (source_slug, target_url):`)
    for (const c of collisions) {
      console.error(`  ${c.id} ${c.source_slug} ${c.target_url}`)
    }
    console.error('No reconciliation evidence is produced while any collision exists. Resolve duplicates first.')
    process.exit(1)
  }
}

async function main(): Promise<void> {
  console.log('MODE: READ-ONLY EVIDENCE REPORT')

  const stale = validate(await fetchStalePlanned())
  const recons: Reconciliation[] = stale.map((r) => ({
    id: r.id,
    source_slug: r.source_slug,
    old_target_url: r.target_url,
    new_target_url: newUrlFor(r.target_url),
  }))

  assertNoIntraMappingCollisions(recons)
  await assertNoCollisions(recons)

  console.log(`affected_count: ${recons.length}`)
  console.log(`malformed_count: 0`)
  console.log(`collision_count: 0`)
  console.log('')
  for (const r of recons) {
    console.log(`· ${r.id} ${r.source_slug}`)
    console.log(`    old: ${r.old_target_url}`)
    console.log(`    new: ${r.new_target_url}`)
  }
  console.log('')
  console.log(`rollback_count: ${recons.length}`)
  for (const r of recons) {
    console.log(`ROLLBACK ${r.new_target_url} -> ${r.old_target_url}`)
  }
  console.log('')
  console.log('Done — read-only report (no rows were modified; production reconciliation is applied via supervisor SQL)')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
