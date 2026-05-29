/**
 * GET /api/attorney/profile/strength
 * Returns a profile-strength score (0-100) + a checklist of completeness items.
 * Used by the My Profile page and the gig builder banner to show a Fiverr-style
 * "build your profile" progress meter.
 */
import { requireAttorney } from '@/lib/attorneyAuth'
import { computeAttorneyStrength, PROFILE_PUBLISH_THRESHOLD } from '@/lib/attorneyProfileStrength'

export async function GET() {
  const { ctx, error, status } = await requireAttorney({ allowInactive: true })
  if (!ctx) return Response.json({ error }, { status })

  const result = await computeAttorneyStrength(ctx.db, ctx.profileId)
  return Response.json({
    ...result,
    rating: result.ratings,
    publish_threshold: PROFILE_PUBLISH_THRESHOLD,
    publish_ready: result.score >= PROFILE_PUBLISH_THRESHOLD && !!result.username,
  })
}
