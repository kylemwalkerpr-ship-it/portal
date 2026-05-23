import { getCurrentConsultant } from '@/lib/consultant'
import { computeConsultantStrength, CONSULTANT_PUBLISH_THRESHOLD } from '@/lib/consultantProfileStrength'

export async function GET() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const result = await computeConsultantStrength(auth.db, auth.profile.id)
  return Response.json({
    ...result,
    publish_threshold: CONSULTANT_PUBLISH_THRESHOLD,
    publish_ready: result.score >= CONSULTANT_PUBLISH_THRESHOLD && !!result.username,
  })
}
