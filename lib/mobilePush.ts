import { verifyMobileBearer } from './mobileAuth'
import { createSupabaseAdminClient } from './supabase'

export async function handlePushRegister(req: Request) {
  const auth = await verifyMobileBearer(req.headers.get('authorization'))
  if (auth.status !== 'authenticated') {
    return Response.json({ error: { message: auth.reason === 'missing' ? 'Missing session token.' : 'Invalid session token.' }, signInRequired: true }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const deviceToken = typeof body.deviceToken === 'string' ? body.deviceToken.trim() : ''
  const platform = typeof body.platform === 'string' ? body.platform : 'ios'

  if (!deviceToken) {
    return Response.json({ error: { message: 'Missing deviceToken.' } }, { status: 400 })
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db.from('profiles').select('id').eq('clerk_user_id', auth.userId).single()

  if (!profile) return Response.json({ error: { message: 'Profile not found.' } }, { status: 404 })

  const { error } = await db.from('device_tokens').upsert({
    profile_id: profile.id,
    token: deviceToken,
    platform,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'token' })

  if (error) {
    console.error('[mobile/push/register] upsert failed:', error.message)
    return Response.json({ error: { message: 'Failed to register device token.' } }, { status: 500 })
  }

  return Response.json({ registered: true })
}