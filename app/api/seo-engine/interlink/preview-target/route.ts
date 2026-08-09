import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'

/**
 * POST /api/seo-engine/interlink/preview-target
 *
 * Body: { url: string }
 *
 * Performs a lightweight GET (with strict 6s timeout, capped at 200KB body,
 * no JS execution, no image fetch) and returns:
 *   {
 *     ok: true,
 *     url, finalUrl, httpStatus, contentType,
 *     title (from <title>), description (from <meta name="description">),
 *     canonical, redirectChain[],
 *     wordCount, anchorCount, hasSchemaOrg, hasOpenGraph,
 *     bodyPreview (first 800 chars of visible text)
 *   }
 *
 * This is the live-metadata counterpart of the persisted-state footer. It
 * lets the operator click "Audit" beside any seo_interlinks edge and see
 * what the destination currently looks like \u2014 without leaving the wizard.
 *
 * We never follow redirects across auth walls. Internal paywalled domains
 * will report httpStatus=401/403 and the operator can decide.
 */
const MAX_BODY_BYTES = 200_000
const FETCH_TIMEOUT_MS = 6_000
const ESTATE_HOSTS = [
  'yousafeconsultancy.com',
  'caseworks.com',
  'portal.yousafeconsultancy.com',
]

function extractFirst(text: string, re: RegExp): string | null {
  const m = text.match(re)
  if (!m || m.index == null) return null
  return m[1] || m[0] || null
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\u2019')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = (await req.json().catch(() => ({}))) as { url?: string }
    const target = String(body.url || '').trim()
    if (!target) return NextResponse.json({ ok: false, error: 'url required' }, { status: 400 })
    let urlObj: URL
    try { urlObj = new URL(target) } catch { return NextResponse.json({ ok: false, error: 'invalid url' }, { status: 400 }) }

    // Strict protocol policy \u2014 only http/https.
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return NextResponse.json({ ok: false, error: 'only http/https allowed' }, { status: 400 })
    }

    // SSRF guard \u2014 don't let operators scan arbitrary internal hosts.
    if (/^(10|127\.|192\.168|172\.(1[6-9]|2[0-9]|3[01]))/.test(urlObj.hostname) || urlObj.hostname === 'localhost') {
      return NextResponse.json({ ok: false, error: 'blocked host' }, { status: 400 })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const redirectChain: Array<{ url: string; status: number }> = []
    let current = target
    let finalUrl = target
    let httpStatus = 0
    let contentType = ''
    let bodyText = ''
    for (let hop = 0; hop < 4; hop++) {
      try {
        const res = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'YouSafe-Internal-Audit/1.0 (+https://portal.yousafeconsultancy.com/)',
            'Accept': 'text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.5',
            'Accept-Language': 'en-US,en;q=0.8',
          },
        })
        httpStatus = res.status
        contentType = res.headers.get('content-type') || ''
        const loc = res.headers.get('location')
        if ([301, 302, 303, 307, 308].includes(res.status) && loc) {
          redirectChain.push({ url: current, status: res.status })
          current = new URL(loc, current).toString()
          finalUrl = current
          continue
        }
        const buf = await res.arrayBuffer()
        const slice = buf.byteLength > MAX_BODY_BYTES ? buf.slice(0, MAX_BODY_BYTES) : buf
        bodyText = new TextDecoder('utf-8', { fatal: false }).decode(slice)
        break
      } catch (e) {
        httpStatus = httpStatus || 0
        bodyText = bodyText || `fetch failed: ${e instanceof Error ? e.message : String(e)}`
        break
      }
    }
    clearTimeout(timer)

    // Cheap HTML parse via regex (no cheerio \u2014 keep this dependency-free).
    const title = extractFirst(bodyText, /<title[^>]*>([^<]{1,300})<\/title>/i)
    const description = extractFirst(bodyText, /<meta\s+name=["']description["']\s+content=["']([^"']{1,400})["']/i)
    const canonical = extractFirst(bodyText, /<link\s+rel=["']canonical["']\s+href=["']([^"']{1,400})["']/i)
    const ogTitle = extractFirst(bodyText, /<meta\s+property=["']og:title["']\s+content=["']([^"']{1,200})["']/i)
    const ogImage = extractFirst(bodyText, /<meta\s+property=["']og:image["']\s+content=["']([^"']{1,400})["']/i)
    const hasSchemaOrg = /"@context"\s*:\s*"https?:\/\/schema\.org/i.test(bodyText)
    const hasOpenGraph = /<meta\s+property=["']og:/i.test(bodyText)
    const anchorCount = (bodyText.match(/<a\s[^>]*href=/gi) || []).length

    const visible = stripTags(bodyText)
    const wordCount = visible ? visible.split(/\s+/).length : 0
    const bodyPreview = visible.slice(0, 800)

    const isEstate = ESTATE_HOSTS.some((h) => finalUrl.includes(h))

    return NextResponse.json({
      ok: true,
      url: target,
      finalUrl,
      httpStatus,
      contentType,
      title: title?.trim() || ogTitle?.trim() || null,
      description: description?.trim() || null,
      canonical,
      ogImage,
      hasSchemaOrg,
      hasOpenGraph,
      anchorCount,
      wordCount,
      redirectChain,
      isEstate,
      bodyPreview,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'preview failed' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
