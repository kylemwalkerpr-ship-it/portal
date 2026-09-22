/**
 * P10 HTTP-boundary helpers shared by the attribution routes.
 *
 * Cross-site browser posts are refused when an `Origin` header is present: the
 * attribution identity lives in a first-party cookie, so a third-party page must
 * never be able to create, resume or enrich one. No IP address, user agent or
 * other fingerprinting signal is read anywhere in this module.
 */

export const ATTRIBUTION_CROSS_ORIGIN_MESSAGE = 'Cross-origin attribution requests are not accepted.'

export function isCrossOriginRequest(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  let requestOrigin = ''
  try {
    requestOrigin = new URL(req.url).origin
  } catch {
    return true
  }
  return !requestOrigin || origin !== requestOrigin
}

/** Bounded JSON body read — a hostile body must not be able to blow up the worker. */
export async function readBoundedJson(req: Request, maxBytes = 8192): Promise<Record<string, unknown>> {
  const raw = await req.text().catch(() => '')
  if (!raw) return {}
  if (raw.length > maxBytes) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}
