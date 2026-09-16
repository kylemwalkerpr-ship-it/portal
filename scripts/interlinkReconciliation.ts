/**
 * scripts/interlinkReconciliation.ts
 *
 * Pure classification/mapping logic for the strictly read-only
 * `seo_interlinks` marketplace_cta reconciliation report
 * (scripts/reconcile-stale-planned-interlinks.mts).
 *
 * No database client, no I/O, no mutation: given the fetched rows this module
 * decides which historical rows are safe to remap, which already collide with
 * a canonical row, and which must fail closed. The executable report keeps all
 * Supabase access; this logic stays unit-testable and side-effect free.
 *
 * Rules:
 *   - Canonical rows are evidence/no-op, never candidates.
 *   - The two known legacy shapes map deterministically to
 *     `https://market.yousafeconsultancy.com/categories/<same-id>` ONLY when
 *     the id is a real top-level category/subcategory under the current
 *     canonical catalogue.
 *   - Unknown noncanonical shape, malformed URL, invalid id, query/hash,
 *     foreign host, or a valid legacy row that is not status='planned' fails
 *     closed — never guessed, never normalized.
 *   - A stale row whose mapped (source_slug, canonical_target_url) pair is
 *     already held by another row is an existing-canonical collision: it is
 *     reported with both row ids and excluded from update-safe candidates
 *     (the supervisor decides later; this tool never updates or merges).
 *   - Two update-safe candidates mapping to the same
 *     (source_slug, canonical_target_url) pair are an intra-mapping collision:
 *     ambiguous, therefore fail closed.
 */
import {
  isKnownMarketplaceCategoryId,
  marketplaceCategoryHref,
  parseCanonicalMarketplaceCategoryUrl,
} from '../lib/marketplaceSeo'

/** Retired Portal-host singular shape still present in historical rows. */
const LEGACY_SINGULAR_PREFIX = 'https://portal.yousafeconsultancy.com/marketplace/category/'
/** Retired Portal-host plural shape (the only shape the original script knew). */
const LEGACY_PLURAL_PREFIX = 'https://portal.yousafeconsultancy.com/marketplace/categories/'
const LEGACY_PREFIXES = [LEGACY_SINGULAR_PREFIX, LEGACY_PLURAL_PREFIX]

/** Public category slug shape used by the canonical catalogue. */
const CATEGORY_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface InterlinkReconcileRow {
  id: string
  source_slug: string
  target_url: string
  status: string | null
}

export type MarketplaceCtaClass =
  | 'canonical'
  | 'legacy_update_safe'
  | 'legacy_collision'
  | 'legacy_non_planned'
  | 'legacy_intra_mapping_collision'
  | 'malformed_unsupported'

export interface ClassifiedMarketplaceCtaRow extends InterlinkReconcileRow {
  classification: MarketplaceCtaClass
  categoryId?: string
  canonicalTargetUrl?: string
  collidesWithRowId?: string
}

export interface IntraMappingCollision {
  sourceSlug: string
  canonicalTargetUrl: string
  rowIds: string[]
}

export interface RollbackMapping {
  staleId: string
  sourceSlug: string
  from: string
  to: string
}

export interface MarketplaceCtaReconciliation {
  total: number
  rows: ClassifiedMarketplaceCtaRow[]
  canonicalRows: ClassifiedMarketplaceCtaRow[]
  updateSafeCandidates: ClassifiedMarketplaceCtaRow[]
  existingCanonicalCollisions: ClassifiedMarketplaceCtaRow[]
  intraMappingCollisions: IntraMappingCollision[]
  malformedUnsupported: ClassifiedMarketplaceCtaRow[]
  nonPlannedLegacy: ClassifiedMarketplaceCtaRow[]
  rollbackMappings: RollbackMapping[]
  failsClosed: boolean
}

function legacyCategoryId(targetUrl: string): string | null {
  for (const prefix of LEGACY_PREFIXES) {
    if (targetUrl.startsWith(prefix)) {
      const id = targetUrl.slice(prefix.length)
      return CATEGORY_ID_RE.test(id) ? id : null
    }
  }
  return null
}

/**
 * Classify every fetched marketplace_cta row. `existingPairRows` carries any
 * additional rows (any interlink reason) fetched by (source_slug, target_url)
 * so cross-reason collisions on the table's unique constraint are detected
 * too.
 */
export function classifyMarketplaceCtaRows(
  rows: InterlinkReconcileRow[],
  existingPairRows: InterlinkReconcileRow[] = [],
): MarketplaceCtaReconciliation {
  const pairKey = (sourceSlug: string, targetUrl: string) => `${sourceSlug}\u0000${targetUrl}`
  const classified = new Map<string, ClassifiedMarketplaceCtaRow>()
  const canonicalPairOwners = new Map<string, string>()
  const candidates: ClassifiedMarketplaceCtaRow[] = []

  for (const row of rows) {
    const canonical = parseCanonicalMarketplaceCategoryUrl(row.target_url)
    if (canonical) {
      classified.set(row.id, { ...row, classification: 'canonical', categoryId: canonical.categoryId })
      const key = pairKey(row.source_slug, row.target_url)
      if (!canonicalPairOwners.has(key)) canonicalPairOwners.set(key, row.id)
      continue
    }

    const legacyId = legacyCategoryId(row.target_url)
    if (legacyId === null || !isKnownMarketplaceCategoryId(legacyId)) {
      // Unknown shape, malformed URL, or an id the canonical catalogue does
      // not know: fail closed instead of guessing a category.
      classified.set(row.id, { ...row, classification: 'malformed_unsupported' })
      continue
    }

    const canonicalTargetUrl = marketplaceCategoryHref(legacyId)
    if (row.status !== 'planned') {
      classified.set(row.id, {
        ...row,
        classification: 'legacy_non_planned',
        categoryId: legacyId,
        canonicalTargetUrl,
      })
      continue
    }

    candidates.push({ ...row, classification: 'legacy_update_safe', categoryId: legacyId, canonicalTargetUrl })
  }

  for (const row of existingPairRows) {
    const key = pairKey(row.source_slug, row.target_url)
    if (!canonicalPairOwners.has(key)) canonicalPairOwners.set(key, row.id)
  }

  const collisions: ClassifiedMarketplaceCtaRow[] = []
  const tentative: ClassifiedMarketplaceCtaRow[] = []
  for (const candidate of candidates) {
    const ownerId = canonicalPairOwners.get(pairKey(candidate.source_slug, candidate.canonicalTargetUrl!))
    if (ownerId && ownerId !== candidate.id) {
      collisions.push({ ...candidate, classification: 'legacy_collision', collidesWithRowId: ownerId })
    } else {
      tentative.push(candidate)
    }
  }

  const groups = new Map<string, ClassifiedMarketplaceCtaRow[]>()
  for (const candidate of tentative) {
    const key = pairKey(candidate.source_slug, candidate.canonicalTargetUrl!)
    const group = groups.get(key)
    if (group) group.push(candidate)
    else groups.set(key, [candidate])
  }

  const intraMappingCollisions: IntraMappingCollision[] = []
  const updateSafeCandidates: ClassifiedMarketplaceCtaRow[] = []
  for (const group of groups.values()) {
    if (group.length > 1) {
      intraMappingCollisions.push({
        sourceSlug: group[0].source_slug,
        canonicalTargetUrl: group[0].canonicalTargetUrl!,
        rowIds: group.map((row) => row.id),
      })
      for (const row of group) {
        classified.set(row.id, { ...row, classification: 'legacy_intra_mapping_collision' })
      }
    } else {
      updateSafeCandidates.push(group[0])
    }
  }
  for (const row of collisions) classified.set(row.id, row)
  for (const row of updateSafeCandidates) classified.set(row.id, row)

  const orderedRows = rows.map(
    (row) => classified.get(row.id) ?? ({ ...row, classification: 'malformed_unsupported' } as ClassifiedMarketplaceCtaRow),
  )
  const canonicalRows = orderedRows.filter((row) => row.classification === 'canonical')
  const updateSafe = orderedRows.filter((row) => row.classification === 'legacy_update_safe')
  const existingCanonicalCollisions = orderedRows.filter((row) => row.classification === 'legacy_collision')
  const malformedUnsupported = orderedRows.filter((row) => row.classification === 'malformed_unsupported')
  const nonPlannedLegacy = orderedRows.filter((row) => row.classification === 'legacy_non_planned')

  return {
    total: rows.length,
    rows: orderedRows,
    canonicalRows,
    updateSafeCandidates: updateSafe,
    existingCanonicalCollisions,
    intraMappingCollisions,
    malformedUnsupported,
    nonPlannedLegacy,
    rollbackMappings: updateSafe.map((row) => ({
      staleId: row.id,
      sourceSlug: row.source_slug,
      from: row.target_url,
      to: row.canonicalTargetUrl!,
    })),
    failsClosed:
      malformedUnsupported.length > 0 ||
      nonPlannedLegacy.length > 0 ||
      intraMappingCollisions.length > 0,
  }
}
