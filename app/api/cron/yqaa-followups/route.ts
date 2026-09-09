import { runYqaaFollowUps } from '@/lib/messengerFollowups'

function authorized(req: Request) {
  const expected = process.env.CRON_SECRET || ''
  const auth = req.headers.get('authorization') || ''
  return Boolean(expected) && auth === `Bearer ${expected}`
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const limit = Number(body?.limit || 50)
    const result = await runYqaaFollowUps({ limit })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[yqaa-followups]', err)
    return Response.json({ error: err instanceof Error ? err.message : 'YQAA follow-up run failed' }, { status: 500 })
  }
}
