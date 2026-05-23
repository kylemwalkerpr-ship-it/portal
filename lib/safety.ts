/**
 * Safety filter — server-policy mirror of the prototype's client-side check.
 *
 * Detects in user-typed text:
 *   • Phone numbers (US/INT, with separators or spaces)
 *   • Email addresses
 *   • External URLs (anything not in ALLOWED_HOSTS)
 *   • Social/messenger handles (@user, t.me/, wa.me/, …)
 *   • Payment-app names + cashtags
 *   • Obfuscation attempts ("g m a i l . c o m", "5 5 5 - 1 2 3 - 4 5 6 7",
 *     "[at]", "(at)", "d o t" stand-ins)
 *
 * Two exports:
 *   • scanMessage(text) → { ok, violations, hardViolations, softViolations }
 *     used as middleware on every POST /api/messages/* and POST /api/inquiries.
 *   • redactForDisplay(text) → string — for legacy rows that bypassed the
 *     composer (defence-in-depth at render time).
 */

const ALLOWED_HOSTS = [
  'mycaseworks.com',
  'yousafe.com',
  'yousafe.app',
  'yousafeconsultancy.com',
  'localhost',
]

const REDACTION_MARK = '⛔'

export interface SafetyViolation {
  type: string
  label: string
  raw: string
  hard: boolean
}

export interface ScanResult {
  ok: boolean
  violations: SafetyViolation[]
  hardViolations: SafetyViolation[]
  softViolations: SafetyViolation[]
}

function unobfuscate(t: string): string {
  let s = t
  s = s.replace(/\b(?:[A-Za-z0-9]\s){2,}[A-Za-z0-9]\b/g, (m) => m.replace(/\s+/g, ''))
  s = s.replace(/(?:\d[\s\-_.]){4,}\d/g, (m) => m.replace(/[\s\-_.]+/g, ''))
  s = s
    .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
    .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
    .replace(/\s*\{\s*at\s*\}\s*/gi, '@')
    .replace(/\s+at\s+/gi, '@')
    .replace(/\s*\(\s*dot\s*\)\s*/gi, '.')
    .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
    .replace(/\s*\{\s*dot\s*\}\s*/gi, '.')
    .replace(/\s+dot\s+/gi, '.')
  return s
}

const PATTERNS: Array<{ type: string; label: string; re: RegExp }> = [
  { type: 'email', label: 'email address', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { type: 'phone', label: 'phone number', re: /(?:\+?\d{1,3}[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}\b/g },
  { type: 'phone_intl', label: 'phone number', re: /(?<!\d)\+?\d{7,15}(?!\d)/g },
  { type: 'url', label: 'external link', re: /\b((?:https?:\/\/|www\.)[A-Z0-9.-]+\.[A-Z]{2,}[^\s]*)/gi },
  { type: 'bare_domain', label: 'external link', re: /\b[A-Z0-9-]+\.(?:com|net|org|io|app|me|co|info|biz|us|uk|ca|in|de|tg|gg|ly|sh|xyz|email|chat|page)(?:\/\S*)?/gi },
  { type: 'handle', label: 'off-platform handle', re: /(?<!\S)@[A-Z0-9_.]{3,30}\b/gi },
  { type: 'tg_handle', label: 'Telegram link', re: /\b(?:t\.me|telegram\.me|telegram\.dog)\/\S+/gi },
  { type: 'wa_handle', label: 'WhatsApp link', re: /\b(?:wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com)\/\S+/gi },
  { type: 'cashtag', label: 'payment-app tag', re: /(?<!\S)\$[A-Z][A-Z0-9_]{2,29}\b/gi },
  { type: 'pay_app', label: 'off-platform payment', re: /\b(?:venmo|paypal|paypal\.me|cash\s?app|cash\.app|zelle|wise|revolut|western\s?union|moneygram|payoneer|bitcoin|btc|ethereum|eth|usdc|usdt|wire\s?transfer)\b/gi },
]

const SOFT_PATTERNS: Array<{ type: string; label: string; re: RegExp }> = [
  {
    type: 'offplatform_intent',
    label: 'requests off-platform contact',
    re: /\b(?:text\s+me|call\s+me|email\s+me|whatsapp\s+me|dm\s+me|message\s+me\s+on|let'?s\s+take\s+this\s+(?:off|outside)|outside\s+the\s+platform|reach\s+me\s+at|my\s+number\s+is|my\s+email\s+is|here'?s\s+my)\b/gi,
  },
]

function isAllowedUrl(raw: string): boolean {
  try {
    let url = raw
    if (/^www\./i.test(url)) url = 'http://' + url
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url
    const u = new URL(url)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h))
  } catch {
    return false
  }
}

function detect(text: string): SafetyViolation[] {
  const out: SafetyViolation[] = []
  const seen = new Set<string>()
  const add = (raw: string, type: string, label: string, hard: boolean) => {
    const k = type + ':' + raw.toLowerCase().trim()
    if (seen.has(k)) return
    seen.add(k)
    out.push({ type, label, raw, hard })
  }

  for (const p of PATTERNS) {
    p.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = p.re.exec(text)) !== null) {
      const raw = m[0]
      if ((p.type === 'url' || p.type === 'bare_domain') && isAllowedUrl(raw)) continue
      if (p.type === 'handle' && /^@(everyone|here|all|team|admins?|me)$/i.test(raw)) continue
      add(raw, p.type, p.label, true)
    }
  }
  for (const p of SOFT_PATTERNS) {
    p.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = p.re.exec(text)) !== null) {
      add(m[0], p.type, p.label, false)
    }
  }
  return out
}

export function scanMessage(text: unknown): ScanResult {
  if (!text || typeof text !== 'string') {
    return { ok: true, violations: [], hardViolations: [], softViolations: [] }
  }
  const canonical = unobfuscate(text)
  const a = detect(text)
  const b = detect(canonical)
  const merged: SafetyViolation[] = []
  const seen = new Set<string>()
  for (const v of [...a, ...b]) {
    const k = v.type + ':' + v.raw.toLowerCase().trim()
    if (seen.has(k)) continue
    seen.add(k)
    merged.push(v)
  }
  const hard = merged.filter((v) => v.hard)
  const soft = merged.filter((v) => !v.hard)
  return { ok: hard.length === 0, violations: merged, hardViolations: hard, softViolations: soft }
}

export function scanAttachmentName(name: unknown): ScanResult {
  if (!name || typeof name !== 'string') {
    return { ok: true, violations: [], hardViolations: [], softViolations: [] }
  }
  return scanMessage(name.replace(/[._-]+/g, ' '))
}

/** Render-time redaction for legacy rows. */
export function redactForDisplay(text: string): string {
  if (!text) return text
  let out = text
  for (const p of PATTERNS) {
    out = out.replace(p.re, (raw) => {
      if ((p.type === 'url' || p.type === 'bare_domain') && isAllowedUrl(raw)) return raw
      if (p.type === 'handle' && /^@(everyone|here|all|team|admins?|me)$/i.test(raw)) return raw
      return REDACTION_MARK
    })
  }
  return out
}

/**
 * One-call helper for API routes — uniform shape with optional error/violations.
 * Callers: `if (!s.ok) return Response.json({ error: s.error, ... }, 422)`.
 */
export interface SafetyGuardResult {
  ok: boolean
  error?: string
  violations?: SafetyViolation[]
}

export function safetyGuard(text: string): SafetyGuardResult {
  const r = scanMessage(text)
  if (r.ok) return { ok: true }
  const labels = Array.from(new Set(r.hardViolations.map((v) => v.label))).join(', ')
  return {
    ok: false,
    error: `Message blocked — contains ${labels}. Keep all communication on YouSafe.`,
    violations: r.hardViolations,
  }
}
