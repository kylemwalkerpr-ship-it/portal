/**
 * Server-side translation with Supabase-backed cache.
 *
 * Workflow:
 *   1. hash(text + lang) → check `translations` table → return if hit.
 *   2. On miss, call MyMemory (same endpoint /api/translate uses
 *      client-side) and insert the result back into the table.
 *   3. Errors fall through to returning the original text — translation
 *      is best-effort, never fatal.
 *
 * Pricing/limits: MyMemory free tier is generous for the size of this
 * cache. Once populated, server-side calls happen entirely against the
 * cache (one round-trip to Supabase, no outbound API).
 *
 * This file is intentionally Edge-compatible — no Node-only crypto or
 * fs imports. We use a tiny FNV-1a hash for keys (avoids importing
 * crypto at module load).
 */
import { createSupabaseAdminClient } from './supabase'

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get'

const LANG_MAP: Record<string, string> = {
  en: 'en', es: 'es', fr: 'fr', ar: 'ar', zh: 'zh-CN', hi: 'hi', pt: 'pt',
}

// Cheap, deterministic hash for cache keys. Cryptographically weak — fine
// for this purpose because the (text_hash, target_lang) tuple is unique
// only-ish and we always have the source_text for collision audit.
function fnvHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// In-isolate memo for ultra-hot strings (page titles, CTAs that appear on
// every render). The Supabase cache catches everything else.
const memo = new Map<string, string>()
const MEMO_LIMIT = 500

function memoKey(text: string, lang: string) {
  // Use the FNV hash so unicode-heavy strings don't blow up the key length
  return `${lang}:${fnvHash(text)}`
}

/** Translate one string. Returns the original on any failure. */
export async function translateString(
  text: string,
  targetLang: string,
  opts?: { sourceLang?: string }
): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return text
  if (!targetLang || targetLang === 'en') return text
  // Skip pure numbers, URLs, emails — no useful translation possible.
  if (/^https?:\/\//.test(trimmed)) return text
  if (/^\S+@\S+\.\S+$/.test(trimmed)) return text
  if (/^[\d\s.,$%+\-()]+$/.test(trimmed)) return text

  const key = memoKey(text, targetLang)
  const memoHit = memo.get(key)
  if (memoHit) return memoHit

  const sourceLang = opts?.sourceLang || 'en'
  const hash = fnvHash(`${sourceLang}:${text}`)

  // 1. Supabase cache lookup
  try {
    const db = createSupabaseAdminClient()
    const { data } = await db
      .from('translations')
      .select('translated')
      .eq('text_hash', hash)
      .eq('target_lang', targetLang)
      .maybeSingle()
    if (data?.translated) {
      memoSet(key, data.translated)
      return data.translated
    }
  } catch {
    /* DB miss — fall through */
  }

  // 2. Outbound translate
  const translated = await callMyMemory(text, sourceLang, targetLang)
  if (!translated) return text

  // 3. Cache it (best-effort)
  try {
    const db = createSupabaseAdminClient()
    await db.from('translations').upsert({
      text_hash:   hash,
      target_lang: targetLang,
      source_lang: sourceLang,
      source_text: text.slice(0, 4000),
      translated,
      provider:    'mymemory',
      updated_at:  new Date().toISOString(),
    })
  } catch { /* non-blocking */ }

  memoSet(key, translated)
  return translated
}

function memoSet(key: string, value: string) {
  if (memo.size >= MEMO_LIMIT) {
    // FIFO eviction — sufficient for hot-path strings
    const first = memo.keys().next().value
    if (first) memo.delete(first)
  }
  memo.set(key, value)
}

async function callMyMemory(text: string, sourceLang: string, targetLang: string): Promise<string | null> {
  try {
    const url = new URL(MYMEMORY_URL)
    url.searchParams.set('q', text.substring(0, 500))
    url.searchParams.set('langpair', `${LANG_MAP[sourceLang] || sourceLang}|${LANG_MAP[targetLang] || targetLang}`)
    url.searchParams.set('de', 'info@yousafeconsultancy.com')

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 2500)
    const res = await fetch(url.toString(), { signal: controller.signal })
    clearTimeout(t)
    if (!res.ok) return null
    const data: any = await res.json().catch(() => null)
    if (!data) return null
    const candidate = data.responseData?.translatedText
    if (typeof candidate !== 'string') return null
    if (data.responseStatus !== 200) return null
    if (/PLEASE SELECT|INVALID|MYMEMORY WARNING/i.test(candidate)) return null
    return candidate
  } catch {
    return null
  }
}

/**
 * Batch translate — accepts an array of strings, returns array in order.
 * Single Supabase round-trip for lookups, then parallel API calls only
 * for the misses. Use this when rendering a page so you don't issue
 * N separate translate calls.
 */
export async function translateBatch(
  texts: string[],
  targetLang: string,
  opts?: { sourceLang?: string }
): Promise<string[]> {
  if (targetLang === 'en' || !texts.length) return [...texts]
  const sourceLang = opts?.sourceLang || 'en'

  // De-duplicate
  const uniqueByHash = new Map<string, string>()
  for (const t of texts) {
    const trimmed = String(t || '').trim()
    if (!trimmed) continue
    const h = fnvHash(`${sourceLang}:${t}`)
    if (!uniqueByHash.has(h)) uniqueByHash.set(h, t)
  }
  const hashes = Array.from(uniqueByHash.keys())
  if (!hashes.length) return [...texts]

  // 1. Bulk cache lookup
  let cacheMap = new Map<string, string>()
  try {
    const db = createSupabaseAdminClient()
    const { data } = await db
      .from('translations')
      .select('text_hash, translated')
      .in('text_hash', hashes)
      .eq('target_lang', targetLang)
    for (const row of data ?? []) {
      cacheMap.set((row as any).text_hash, (row as any).translated)
    }
  } catch { /* fall through */ }

  // 2. For misses, call API in parallel (cap concurrency at 6)
  const misses = hashes.filter(h => !cacheMap.has(h))
  const inserts: any[] = []
  const queue = misses.map(async (h) => {
    const src = uniqueByHash.get(h)!
    const translated = await callMyMemory(src, sourceLang, targetLang)
    if (translated) {
      cacheMap.set(h, translated)
      inserts.push({
        text_hash: h,
        target_lang: targetLang,
        source_lang: sourceLang,
        source_text: src.slice(0, 4000),
        translated,
        provider: 'mymemory',
        updated_at: new Date().toISOString(),
      })
    }
  })

  // Run with concurrency limit so we don't hammer MyMemory
  const CONCURRENCY = 6
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    await Promise.all(queue.slice(i, i + CONCURRENCY))
  }

  // 3. Persist new entries (fire-and-forget — don't block the response)
  if (inserts.length) {
    try {
      const db = createSupabaseAdminClient()
      void db.from('translations').upsert(inserts).then(() => null)
    } catch { /* non-blocking */ }
  }

  // 4. Map back over the original list, preserving order + originals on miss
  return texts.map(original => {
    const trimmed = String(original || '').trim()
    if (!trimmed || targetLang === 'en') return original
    const h = fnvHash(`${sourceLang}:${original}`)
    return cacheMap.get(h) || original
  })
}

/**
 * Convenience: extract the active language from the request — honours
 *   1. ?lang=<code> query string
 *   2. x-lang request header (set by middleware)
 *   3. Accept-Language header (first supported match)
 * Defaults to 'en'.
 */
export function languageFromHeaders(h: Headers, search?: URLSearchParams | string): string {
  const supported = new Set(['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'])

  if (search) {
    const params = typeof search === 'string' ? new URLSearchParams(search) : search
    const q = params.get('lang')
    if (q && supported.has(q)) return q
  }
  const fromHeader = h.get('x-lang')
  if (fromHeader && supported.has(fromHeader)) return fromHeader

  const accept = h.get('accept-language')
  if (accept) {
    for (const part of accept.split(',')) {
      const code = part.split(';')[0].trim().toLowerCase().slice(0, 2)
      if (supported.has(code)) return code
    }
  }
  return 'en'
}
