import { handleAccountExport } from '@/lib/mobileAccount'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'

export async function POST(req: Request) {
  if (req.signal.aborted) return Response.json({ error: { message: 'Request cancelled' } }, { status: 499 })
  const h = () => {}; req.signal.addEventListener('abort', h)
  try { return await handleAccountExport(req) }
  catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: { message: msg } }, { status: CPU_TIMEOUT_REGEX.test(msg) ? 503 : 500 })
  } finally { req.signal.removeEventListener('abort', h) }
}
