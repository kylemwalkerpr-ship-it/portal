import { getCurrentConsultant } from '@/lib/consultant'

export async function PATCH(req: Request) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { db, profile, consultant } = auth
  const body = await req.json()

  const profilePayload: Record<string, unknown> = {}
  if (typeof body.full_name === 'string') profilePayload.full_name = body.full_name.trim()
  if (typeof body.email === 'string' && body.email.trim()) profilePayload.email = body.email.trim()

  if (Object.keys(profilePayload).length > 0) {
    const { error } = await db.from('profiles').update(profilePayload).eq('id', profile.id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }

  const consultantPayload: Record<string, unknown> = {}
  if (typeof body.full_name === 'string') consultantPayload.full_name = body.full_name.trim()
  if (typeof body.email === 'string' && body.email.trim()) consultantPayload.email = body.email.trim()
  if (typeof body.bio === 'string') consultantPayload.bio = body.bio
  if (typeof body.available === 'boolean') consultantPayload.available = body.available
  if (typeof body.auto_withdraw === 'boolean') consultantPayload.auto_withdraw = body.auto_withdraw
  if (body.notif_prefs && typeof body.notif_prefs === 'object') consultantPayload.notif_prefs = body.notif_prefs

  if (Object.keys(consultantPayload).length > 0) {
    const { error } = await db.from('consultants').update(consultantPayload).eq('id', consultant.id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
