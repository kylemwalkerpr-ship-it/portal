import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

type FlagReason = {
  type: string
  description: string
  score: number
  detected_at: string
}

function scoreGig(gig: any): { score: number; reasons: FlagReason[] } {
  const now = new Date().toISOString()
  let score = 0
  const reasons: FlagReason[] = []

  const add = (type: string, description: string, points: number) => {
    score += points
    reasons.push({ type, description, score: points, detected_at: now })
  }

  // 1. no_images
  const imgCount = Array.isArray(gig.gallery_images)
    ? gig.gallery_images.length
    : (gig.gallery_images ? Object.keys(gig.gallery_images).length : 0)
  if (!imgCount) {
    add('no_images', 'Gig has no gallery images', 15)
  }

  // 2. short_description
  const descLen = typeof gig.description === 'string' ? gig.description.trim().length : 0
  if (descLen < 100) {
    add('short_description', `Description is only ${descLen} characters (min 100)`, 20)
  }

  // 3. no_tags
  const tagCount = Array.isArray(gig.tags) ? gig.tags.length : 0
  if (!tagCount) {
    add('no_tags', 'Gig has no tags', 10)
  }

  // 4. suspicious_pricing
  const prices: number[] = Array.isArray(gig.tiers)
    ? gig.tiers.filter((t: any) => t.is_active).map((t: any) => Number(t.price) || 0)
    : []
  if (prices.length) {
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    if (minPrice < 100 || maxPrice > 5_000_000) {
      add(
        'suspicious_pricing',
        `Price range ${minPrice}–${maxPrice} cents is outside normal bounds`,
        25,
      )
    }
  }

  // 5. no_requirements
  const reqLen = typeof gig.requirements === 'string' ? gig.requirements.trim().length : 0
  if (!reqLen) {
    add('no_requirements', 'Gig has no requirements set', 10)
  }

  // 6. draft_too_long (applies even if status is draft — still scored)
  if (gig.status === 'draft') {
    const created = gig.created_at ? new Date(gig.created_at) : null
    if (created) {
      const ageDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
      if (ageDays >= 30) {
        add('draft_too_long', `Gig has been in draft for ${Math.floor(ageDays)} days`, 5)
      }
    }
  }

  // 7. content_score_low
  const contentScore = Number(gig.content_score) || 0
  if (contentScore < 30) {
    add('content_score_low', `Content score is ${contentScore} (below 30)`, 15)
  }

  return { score: Math.min(score, 100), reasons }
}

export async function POST(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  let body: Record<string, any> = {}
  try { body = await req.json() } catch { /* optional body */ }

  const specificGigId: string | undefined =
    typeof body.gig_id === 'string' ? body.gig_id.trim() || undefined : undefined

  // Fetch target gigs with tiers
  let gigsQuery = auth.db
    .from('gigs')
    .select(
      'id, status, title, description, gallery_images, tags, requirements, ' +
      'content_score, created_at, auto_flag_score, ' +
      'tiers:gig_tiers(id, tier, price, is_active)'
    )

  if (specificGigId) {
    gigsQuery = gigsQuery.eq('id', specificGigId)
  } else {
    // Run on all non-deleted gigs
    gigsQuery = gigsQuery.not('status', 'eq', 'deleted')
  }

  const { data: gigsRaw, error } = await gigsQuery
  if (error) return fail(error.message, 500)
  const gigs: any[] = gigsRaw ?? []
  if (!gigs.length) return ok({ processed: 0, flagged: 0, high_priority: 0 })

  let processed = 0
  let flagged = 0
  let highPriority = 0
  const now = new Date().toISOString()

  for (const gig of gigs) {
    processed++
    const { score, reasons } = scoreGig(gig)

    // Update gig with new flag info
    try {
      await auth.db
        .from('gigs')
        .update({
          auto_flag_score: score,
          auto_flag_reasons: reasons,
          auto_flagged_at: now,
          updated_at: now,
        })
        .eq('id', gig.id)
    } catch {
      // Continue processing other gigs
      continue
    }

    if (score > 0) flagged++

    // High-priority queue entry for active gigs with score > 40
    if (score > 40 && gig.status === 'active') {
      const priority = score > 70 ? 'urgent' : score > 50 ? 'high' : 'normal'
      if (priority === 'urgent' || priority === 'high') highPriority++

      try {
        // Check if an open auto_flag entry already exists to avoid duplicates
        const { data: existing } = await auth.db
          .from('moderation_queue')
          .select('id')
          .eq('target_table', 'gigs')
          .eq('target_id', gig.id)
          .eq('status', 'open')
          .eq('flag_type', 'auto_flag')
          .maybeSingle()

        if (!existing) {
          await auth.db.from('moderation_queue').insert({
            target_table: 'gigs',
            target_id: gig.id,
            reason: `Auto-flagged: score ${score}. Reasons: ${reasons.map((r) => r.type).join(', ')}`,
            status: 'open',
            flag_type: 'auto_flag',
            priority,
          })
        } else {
          // Update priority if it changed
          await auth.db
            .from('moderation_queue')
            .update({ priority, notes: `Re-scored: ${score}`, updated_at: now } as any)
            .eq('id', existing.id)
        }
      } catch {
        // Non-fatal
      }
    }
  }

  return ok({ processed, flagged, high_priority: highPriority })
}
