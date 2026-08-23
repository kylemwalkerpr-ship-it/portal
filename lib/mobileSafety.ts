import { verifyMobileBearer } from './mobileAuth'

export async function handleReport(req: Request) {
  const auth = await verifyMobileBearer(req.headers.get('authorization'))
  if (auth.status !== 'authenticated') {
    return Response.json({ error: { message: auth.reason === 'missing' ? 'Missing session token.' : 'Invalid session token.' }, signInRequired: true }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : ''

  if (!targetUserId) return Response.json({ error: { message: 'Missing targetUserId.' } }, { status: 400 })
  if (!reason) return Response.json({ error: { message: 'Missing reason.' } }, { status: 400 })

  // Not implemented — no server-side report persistence exists yet.
  // Apple 1.2 requires honesty: don't return success when nothing was written.
  return Response.json({
    error: { message: 'Server-side report persistence is not yet available. The report has not been saved.' },
  }, { status: 501 })
}

export async function handleBlock(req: Request) {
  const auth = await verifyMobileBearer(req.headers.get('authorization'))
  if (auth.status !== 'authenticated') {
    return Response.json({ error: { message: auth.reason === 'missing' ? 'Missing session token.' : 'Invalid session token.' }, signInRequired: true }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const targetUserId = typeof body.targetUserId === 'string' ? body.targetUserId.trim() : ''
  if (!targetUserId) return Response.json({ error: { message: 'Missing targetUserId.' } }, { status: 400 })

  // Not implemented — no server-side block persistence exists yet.
  // Apple 1.2 requires honesty: don't return success when nothing was written.
  return Response.json({
    error: { message: 'Server-side block persistence is not yet available. The block has not been saved.' },
  }, { status: 501 })
}