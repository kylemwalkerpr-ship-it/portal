import { requirePortalUser } from '@/lib/portalAuth'
import { mutateYqaaFact, readYqaaMemory } from '@/lib/yqaaPrivacy'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const headers = { 'Cache-Control': 'no-store' }

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status, headers })
  if (!['client', 'student'].includes(auth.role)) return Response.json({ error: 'Forbidden' }, { status: 403, headers })
  const { id } = await context.params
  const page = Number(new URL(req.url).searchParams.get('page') || '0')
  if (!uuid.test(id) || !Number.isSafeInteger(page) || page < 0 || page > 10737417) return Response.json({ error: 'Invalid scope or page' }, { status: 400, headers })
  try {
    const state = await readYqaaMemory(auth.db, id, auth.profileId, undefined, page * 200)
    return Response.json({ ...state, page }, { headers })
  } catch (error: any) {
    return Response.json({ error: 'Memory state unavailable' }, { status: error?.code === '42501' ? 403 : 503, headers })
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status, headers })
  if (!['client', 'student'].includes(auth.role)) return Response.json({ error: 'Forbidden' }, { status: 403, headers })
  const origin = req.headers.get('origin')
  if (origin && origin !== new URL(req.url).origin) return Response.json({ error: 'Forbidden' }, { status: 403, headers })
  const { id } = await context.params
  const body = await req.json().catch(() => null)
  if (!uuid.test(id) || !body || !uuid.test(body.requestId || '') || !uuid.test(body.factId || '') ||
    !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1 ||
    !Number.isSafeInteger(body.expectedFactVersion) || body.expectedFactVersion < 1 ||
    !['correct', 'delete'].includes(body.action) ||
    (body.action === 'correct' && (typeof body.value !== 'string' || body.value.trim().length < 1 || body.value.length > 1000)) ||
    (body.action === 'delete' && body.value !== undefined)) {
    return Response.json({ error: 'Invalid fact mutation' }, { status: 400, headers })
  }
  try {
    const receipt = await mutateYqaaFact(auth.db, {
      scopeId: id, subjectId: auth.profileId, requestId: body.requestId, expectedVersion: body.expectedVersion,
      factId: body.factId, expectedFactVersion: body.expectedFactVersion, action: body.action, value: body.value,
    })
    const state = await readYqaaMemory(auth.db, id, auth.profileId)
    return Response.json({ ...state, receipt }, { headers })
  } catch (error: any) {
    const status = error?.code === '42501' ? 403 : error?.code === '40001' ? 409 : error?.code === '22023' ? 400 : 503
    return Response.json({ error: status === 409 ? 'Memory changed. Refresh before retrying.' : 'Memory mutation was not confirmed' }, { status, headers })
  }
}
