import { resolveMobileAttorney, unauthRes, attorneyOrders } from '@/lib/mobileAttorney'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

export async function GET(req: Request) {
  if (req.signal.aborted) return Response.json({ error: { message: 'Request cancelled' } }, { status: 499 })
  const h = () => {}; req.signal.addEventListener('abort', h)
  try {
    const auth = await resolveMobileAttorney(req.headers.get('authorization'))
    if (auth.status === 'unauthenticated') return unauthRes(auth.reason)
    if (auth.status === 'forbidden') return Response.json({ error: { message: auth.message } }, { status: auth.httpStatus })
    return await attorneyOrders(req, auth)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: { message: msg } }, { status: CPU_TIMEOUT_REGEX.test(msg) ? 503 : 500 })
  } finally { req.signal.removeEventListener('abort', h) }
}
