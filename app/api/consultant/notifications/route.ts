import { getCurrentConsultant } from '@/lib/consultant'

export async function GET() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await auth.db
    .from('consultant_notification_reads')
    .select('notification_key')
    .eq('consultant_id', auth.profile.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ readKeys: (data ?? []).map(r => r.notification_key) })
}

export async function POST(req: Request) {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const keys: string[] = Array.isArray(body.keys) ? body.keys.filter((k: unknown) => typeof k === 'string' && k.length > 0) : []
  if (keys.length === 0) return Response.json({ ok: true })

  const rows = keys.map(key => ({
    consultant_id: auth.profile.id,
    notification_key: key,
  }))

  const { error } = await auth.db
    .from('consultant_notification_reads')
    .upsert(rows, { onConflict: 'consultant_id,notification_key' })
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}

export async function DELETE() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { error } = await auth.db
    .from('consultant_notification_reads')
    .delete()
    .eq('consultant_id', auth.profile.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
