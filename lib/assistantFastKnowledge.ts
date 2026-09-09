import fs from 'fs'
import path from 'path'
import { rankChunks, type KnowledgeChunk } from '@/lib/messengerSiteKnowledge'

const CORE_FILES = [
  'brand-identity.md',
  'platform.md',
  'offers-orders-escrow.md',
  'policies-ymyl.md',
  'faq.md',
]

const KB_DIR_CANDIDATES = [
  path.join(process.cwd(), 'content', 'messenger-kb'),
  path.join(process.cwd(), 'docs', 'messenger-kb'),
]

let cachedCore: KnowledgeChunk[] | null = null

function splitMarkdown(raw: string, file: string): KnowledgeChunk[] {
  const text = String(raw || '').trim()
  if (!text) return []
  const fileId = file.replace(/\.md$/i, '')
  return text
    .split(/\n(?=#{1,3}\s+)/)
    .map((part, index) => {
      const body = part.trim()
      if (!body) return null
      const titleMatch = body.match(/^#{1,3}\s+(.+)$/m)
      return {
        id: `core:${fileId}#${index}`,
        title: titleMatch?.[1]?.trim() || `${fileId}-${index + 1}`,
        body: body.slice(0, 2600),
        source: `content/messenger-kb/${file}`,
      } satisfies KnowledgeChunk
    })
    .filter((chunk): chunk is KnowledgeChunk => Boolean(chunk))
}

/**
 * Tiny, always-safe core used for generic/platform questions. This deliberately
 * excludes the multi-megabyte crawled network corpus so cold requests do not
 * parse the whole estate just to answer a greeting or explain YouSafe.
 */
export function loadAssistantCoreKnowledge(): KnowledgeChunk[] {
  if (cachedCore) return cachedCore
  const out: KnowledgeChunk[] = []
  for (const dir of KB_DIR_CANDIDATES) {
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue
      for (const file of CORE_FILES) {
        const full = path.join(dir, file)
        if (!fs.existsSync(full)) continue
        out.push(...splitMarkdown(fs.readFileSync(full, 'utf8'), file))
      }
      if (out.length) break
    } catch (err) {
      console.warn('[assistantFastKnowledge] core KB load failed', err instanceof Error ? err.message : err)
    }
  }
  cachedCore = out
  return out
}

export function rankAssistantCoreKnowledge(query: string, limit = 6): KnowledgeChunk[] {
  return rankChunks(loadAssistantCoreKnowledge(), query, limit)
}

/**
 * Deep estate retrieval is reserved for questions whose answer can genuinely
 * depend on a regional/service/article page. Platform mechanics and generic
 * brand questions stay on the small core path.
 */
export function shouldUseDeepNetworkKnowledge(query: string): boolean {
  const q = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!q) return false
  if (/^(hi|hello|hey|hiya|good (morning|afternoon|evening)|thanks|thank you)[!.?\s]*$/.test(q)) return false
  if (/\b(who are you|what is yousafe|tell me about (?:yousafe|this company)|about yousafe consultancy|how does yousafe work)\b/.test(q)) return false

  return /\b(visa|immigration|study permit|student visa|f-?1|pgwp|work permit|sponsorship|sponsor|refusal|appeal|asylum|removal|deport|citizenship|green card|permanent residence|pr\b|subclass\s*\d+|genuine student|admission|university|college|statement of purpose|\bsop\b|credential|wes\b|resume|cv\b|job search|housing|tenant|tenancy|landlord|deposit|legal|lawyer|attorney|court|deadline|canada|australia|united kingdom|\buk\b|united states|\busa?\b|price|pricing|cost|package|service)\b/i.test(q)
}

export function resetAssistantCoreKnowledgeCache(): void {
  cachedCore = null
}
