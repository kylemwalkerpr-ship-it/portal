import { resolveMobileConsultant, unauthRes, consultantHome } from '@/lib/mobileConsultant'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

export async function GET(req: Request) {
  if (req.signal.aborted) return Response.json({ error: { message: 'Request cancelled' } }, { status: 499 })
  const h = () => {}; req.signal.addEventListener('abort', h)
  try {
    const auth = await resolveMobileConsultant(req.headers.get('authorization'))
    if ('status' in auth && auth.status === 'unauthenticated') return unauthRes(auth.reason)
    if ('status' in auth && auth.status === 'forbidden') return Response.json({ error: { message: auth.message } }, { status: auth.httpStatus })
    return await consultantHome(auth as any)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: { message: msg } }, { status: CPU_TIMEOUT_REGEX.test(msg) ? 503 : 500 })
  } finally { req.signal.removeEventListener('abort', h) }
}
