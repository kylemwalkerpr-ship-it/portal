/**
 * Observed-signal computers for dark Master Engine slots.
 *
 * Only values we can derive from draft, live HTML, GSC history, or a
 * backlink snapshot. Missing input → null. Never invent a 0 that would
 * look like a failed audit.
 */

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
}

function normalizeRange(
  value: number | null | undefined,
  min: number,
  max: number,
  higherIsBetter = true,
): number | null {
  if (value == null || !Number.isFinite(value)) return null
  if (max < min) return normalizeRange(value, max, min, !higherIsBetter)
  const span = max - min
  if (span <= 0) return clamp01(higherIsBetter ? (value >= min ? 1 : 0) : (value <= min ? 1 : 0))
  const t = clamp01((value - min) / span)
  return higherIsBetter ? t : 1 - t
}

/** Hreflang: 1 if alternates exist and include a self-ref x-default or region pair. */
export function scoreHreflang(html?: string | null): number | null {
  if (!html) return null
  const tags = html.match(/<link\b[^>]*rel=["']alternate["'][^>]*>/gi) || []
  const langs = tags
    .map((t) => (t.match(/hreflang=["']([^"']+)["']/i) || [])[1])
    .filter(Boolean)
    .map((l) => l.toLowerCase())
  if (!langs.length) return 0
  const hasDefault = langs.includes('x-default')
  const locales = langs.filter((l) => l !== 'x-default')
  const regions = new Set(
    locales.map((l) => (l.includes('-') ? l.split('-').slice(-1)[0] : l)).filter(Boolean),
  )
  if (hasDefault && (locales.length >= 2 || regions.size >= 2)) return 1
  if (locales.length >= 2 || regions.size >= 2) return 0.75
  return 0.4
}

/** Country path or host matches the brief region. */
export function scoreLocalization(url?: string | null, region?: string | null): number | null {
  const u = String(url || '').toLowerCase()
  if (!u) return null
  const r = String(region || '').toUpperCase().slice(0, 2)
  const pathHit = /\/(us|uk|ca|au)(\/|$)/i.exec(u)
  const hostHit = /\b(usa|uk|ca|au)\.yousafeconsultancy\.com/.exec(u)
  if (!pathHit && !hostHit) return r ? 0.35 : 0.5
  if (!r) return 0.7
  const token = (pathHit?.[1] || hostHit?.[1] || '').toLowerCase()
  const want = r === 'US' ? 'us' : r === 'UK' ? 'uk' : r === 'CA' ? 'ca' : r === 'AU' ? 'au' : ''
  const hostWant = r === 'US' ? 'usa' : want
  return token === want || token === hostWant ? 1 : 0.25
}

export function rankVolatility(history?: Array<{ position?: number | null }> | null): number | null {
  const pts = (history || []).map((h) => Number(h.position)).filter((n) => Number.isFinite(n) && n > 0)
  if (pts.length < 3) return null
  const mean = pts.reduce((a, b) => a + b, 0) / pts.length
  const variance = pts.reduce((a, b) => a + (b - mean) ** 2, 0) / pts.length
  const sd = Math.sqrt(variance)
  // sd of 0 → 1 (stable); sd of 12+ positions → 0
  return normalizeRange(sd, 12, 0, true)
}

export function lostQueryRate(currentQueries?: number | null, lostQueries?: number | null): number | null {
  if (lostQueries == null) return null
  const cur = Number(currentQueries) || 0
  const lost = Math.max(0, Number(lostQueries) || 0)
  const denom = cur + lost
  if (denom <= 0) return lost === 0 ? 1 : null
  return 1 - clamp01(lost / denom)
}

export function newQueryVelocity(currentQueries?: number | null, newQueries?: number | null): number | null {
  if (newQueries == null) return null
  const cur = Math.max(1, Number(currentQueries) || 0)
  return normalizeRange(Number(newQueries) / cur, 0, 0.4, true)
}

export function expectedCtrForPosition(position?: number | null): number | null {
  if (position == null || !Number.isFinite(position)) return null
  if (position <= 3) return 0.12
  if (position <= 10) return 0.05
  if (position <= 20) return 0.025
  return 0.01
}

/** 1 = CTR matches or beats the SERP curve for that position. */
export function ctrCurveFit(ctr?: number | null, position?: number | null): number | null {
  const exp = expectedCtrForPosition(position)
  if (ctr == null || exp == null) return null
  const ratio = ctr / Math.max(exp, 0.001)
  return normalizeRange(ratio, 0.2, 1.1, true)
}

/** Dwell high / pogo low when CTR beats the curve at a visible position. */
export function dwellPogoProxy(
  ctr?: number | null,
  position?: number | null,
): { dwell: number | null; pogo: number | null } {
  const fit = ctrCurveFit(ctr, position)
  if (fit == null) return { dwell: null, pogo: null }
  return { dwell: fit, pogo: 1 - fit }
}

export function snippetEligibility(input: {
  faq: boolean
  firstParaAnswer: boolean
  hasList: boolean
  hasTable: boolean
  tldr?: boolean
}): number {
  return clamp01(
    (input.firstParaAnswer ? 0.35 : 0) +
      (input.tldr ? 0.2 : 0) +
      (input.faq ? 0.25 : 0) +
      (input.hasList ? 0.15 : 0) +
      (input.hasTable ? 0.05 : 0),
  )
}

export function paaEligibility(questionHeadings: number, faq: boolean): number {
  return clamp01((faq ? 0.55 : 0) + Math.min(0.45, questionHeadings * 0.12))
}

export function labCoreWebVitals(input: {
  pageWeight: number | null
  imageDimRatio: number | null
  scriptCount: number | null
  viewport: number | null
}): number | null {
  const parts: number[] = []
  if (input.pageWeight != null) parts.push(input.pageWeight)
  if (input.imageDimRatio != null) parts.push(input.imageDimRatio)
  if (input.scriptCount != null) parts.push(normalizeRange(input.scriptCount, 3, 18, false) ?? 0.5)
  if (input.viewport != null) parts.push(input.viewport)
  if (!parts.length) return null
  return parts.reduce((a, b) => a + b, 0) / parts.length
}

export function scoreSecurityHeaders(headers?: Record<string, string> | null): number | null {
  if (!headers) return null
  const keys = Object.keys(headers).map((k) => k.toLowerCase())
  const want = ['content-security-policy', 'x-frame-options', 'strict-transport-security', 'x-content-type-options']
  const hits = want.filter((k) => keys.includes(k) || keys.some((h) => h.includes(k))).length
  return hits / want.length
}

export function brokenLinkRecovery(broken?: number | null, total?: number | null): number | null {
  if (broken == null) return null
  if (broken === 0) return 1
  const denom = Math.max(1, Number(total) || broken)
  return 1 - clamp01(broken / denom)
}
