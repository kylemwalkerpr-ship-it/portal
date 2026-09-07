/**
 * check-gig-taxonomy.mts — CI gate for marketplace inventory hygiene.
 *
 * FAILS (exit 1) when any ACTIVE gig has no canonical taxonomy placement:
 *   - category: unresolvable value, or NULL with no resolvable subcategory
 *     fallback (nothing can place the gig in the taxonomy)
 *   - jurisdiction: a raw value that neither it nor the provider's
 *     profiles.country can map to us|uk|ca|au (garbage), or NULL (untagged)
 *
 * The listing APIs OR in NULL/legacy values so untagged gigs stay visible
 * (buildCategoryOrFilter / jurisdictionCountryOrFilter) — this gate exists
 * so that fallback stays a temporary state, not permanent drift. Run
 * scripts/backfill-gig-taxonomy.mts to fix what can be auto-mapped; the
 * rest needs a human to pick the right category.
 *
 * Flags:
 *   --allow-null   downgrade NULL (untagged) violations to warnings; garbage
 *                  values always fail. Garbage = a value that is present but
 *                  maps to nothing.
 *
 * Usage (CI):
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     npx tsx scripts/check-gig-taxonomy.mts
 *
 * Read-only: only .select() calls.
 */
import { createClient } from '@supabase/supabase-js'
import { resolveSupabaseKey } from '../lib/supabaseKey'
import {
  resolveCategoryValue,
  resolveJurisdictionValue,
  type GigRow,
} from '../lib/gigTaxonomy'

interface Violation {
  gig: GigRow
  kind: 'category' | 'jurisdiction'
  severity: 'fail' | 'warn'
  detail: string
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const allowNull = args.has('--allow-null')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = resolveSupabaseKey()
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)')
    process.exit(1)
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // Active gigs only — that is the inventory every marketplace surface shows.
  const gigs: GigRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('gigs')
      .select('id, slug, title, status, category, subcategory, jurisdiction, provider_id')
      .eq('status', 'active')
      .range(from, from + 999)
    if (error) { console.error('gigs fetch failed:', error.message); process.exit(1) }
    gigs.push(...(data ?? []))
    if (!data || data.length < 1000) break
    from += 1000
  }

  // Provider countries for the jurisdiction fallback (same rule as the landing).
  const providerIds = Array.from(new Set(gigs.map((g) => g.provider_id).filter(Boolean) as string[]))
  const countryByProvider = new Map<string, string | null>()
  for (let i = 0; i < providerIds.length; i += 200) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, country')
      .in('id', providerIds.slice(i, i + 200))
    if (error) { console.error('profiles fetch failed:', error.message); process.exit(1) }
    for (const p of data ?? []) countryByProvider.set(p.id, p.country ?? null)
  }

  const violations: Violation[] = []
  for (const g of gigs) {
    const providerCountry = g.provider_id ? countryByProvider.get(g.provider_id) : null

    // Category: placed iff the category column resolves, or the subcategory
    // column resolves to a real subcategory (parent inferable). A subcategory
    // holding a top-level label does not place the gig.
    const catHit = resolveCategoryValue(g.category)
    const subHit = resolveCategoryValue(g.subcategory)
    const placed = Boolean(catHit) || (subHit !== null && subHit.kind === 'sub')
    if (!placed) {
      const isNull = !g.category?.trim() && !g.subcategory?.trim()
      violations.push({
        gig: g,
        kind: 'category',
        severity: isNull && allowNull ? 'warn' : 'fail',
        detail: g.category?.trim()
          ? `unmapped category "${g.category}"${g.subcategory ? ` (subcategory "${g.subcategory}" also unresolvable)` : ''}`
          : `category is NULL${g.subcategory ? ` and subcategory "${g.subcategory}" is unresolvable` : ''} — no taxonomy placement`,
      })
    }

    // Jurisdiction: raw value + provider-country fallback must map to a code.
    const jx = resolveJurisdictionValue(g.jurisdiction, providerCountry)
    if (!jx) {
      const raw = g.jurisdiction?.trim()
      const isNull = !raw
      violations.push({
        gig: g,
        kind: 'jurisdiction',
        severity: isNull && allowNull ? 'warn' : 'fail',
        detail: raw
          ? `unmapped jurisdiction "${g.jurisdiction}" (provider country "${providerCountry ?? 'unknown'}" does not map either)`
          : `jurisdiction is NULL and provider country "${providerCountry ?? 'unknown'}" does not map`,
      })
    }
  }

  const fails = violations.filter((v) => v.severity === 'fail')
  const warns = violations.filter((v) => v.severity === 'warn')

  console.log(`active gigs checked: ${gigs.length}`)
  console.log(`violations: ${fails.length} failing, ${warns.length} warning${allowNull ? ' (--allow-null)' : ''}`)

  for (const severity of ['fail', 'warn'] as const) {
    const rows = violations.filter((v) => v.severity === severity)
    if (rows.length === 0) continue
    console.log(`\n── ${severity === 'fail' ? 'FAILURES' : 'warnings'} (${rows.length}) ──`)
    for (const v of rows) {
      const label = v.gig.slug || v.gig.id
      console.log(`  [${v.kind}] ${label} — "${v.gig.title}" — ${v.detail}`)
    }
  }

  if (fails.length > 0) {
    console.log(`\n❌ gig taxonomy guard FAILED — ${fails.length} active gig(s) have no canonical placement.`)
    console.log('   Fix: run scripts/backfill-gig-taxonomy.mts (dry-run first) and manually')
    console.log('   assign the rows it flags for review; then re-run this check.')
    process.exit(1)
  }
  console.log('\n✅ gig taxonomy guard passed — every active gig has a canonical category and jurisdiction.')
}

main().catch((e) => { console.error(e); process.exit(1) })
