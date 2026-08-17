/**
 * Shared AI helper for the SEO Master Engine and Discover intel calls.
 *
 * Primary remains whatever the caller pins (historically OpenAI). When that
 * backend is missing or fails, SuperGrok / xAI Grok is the default fallback
 * so knowledge summaries, cluster briefs, and Discover keyword suggestions
 * keep moving without a second paid API key.
 */

import { generateContentText, type ContentAiOptions, type ContentAiResult } from '@/lib/contentAiProvider'

export const ENGINE_FALLBACK_PROVIDER = 'grok' as const

/** Prefer the named primary when it has a key; otherwise skip straight to Grok. */
export function resolveEngineAiProvider(preferred?: string): string {
  const want = String(preferred || 'openai').trim() || 'openai'
  if (want === ENGINE_FALLBACK_PROVIDER) return ENGINE_FALLBACK_PROVIDER
  if (want === 'openai' && !process.env.OPENAI_API_KEY) {
    if (process.env.XAI_API_KEY || process.env.GROK_API_KEY) return ENGINE_FALLBACK_PROVIDER
  }
  return want
}

export async function generateEngineText(
  opts: Omit<ContentAiOptions, 'exclusive'> & { aiProvider?: string },
): Promise<ContentAiResult> {
  const primary = resolveEngineAiProvider(opts.aiProvider)
  try {
    return await generateContentText({
      ...opts,
      aiProvider: primary,
      exclusive: true,
    })
  } catch (primaryErr) {
    if (primary === ENGINE_FALLBACK_PROVIDER) throw primaryErr
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    try {
      return await generateContentText({
        ...opts,
        aiProvider: ENGINE_FALLBACK_PROVIDER,
        exclusive: true,
      })
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      throw new Error(
        `Engine AI failed. Primary (${primary}): ${primaryMsg.slice(0, 280)}. ` +
          `Fallback (Grok): ${fallbackMsg.slice(0, 280)}.`,
      )
    }
  }
}
