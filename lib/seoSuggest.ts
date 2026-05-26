// Shared SEO draft logic — used by:
//   /api/gigs/[id]/seo-suggest   (post-create inline editor)
//   /api/seo-suggest             (pre-create wizard — no gig row yet)
// Keep the prompt + post-processing here so both routes stay in lockstep.

import { getChatProvider } from './chatProvider'

export type SuggestField =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'tagline' | 'description' | 'tags'

export const ALLOWED_FIELDS: SuggestField[] = [
  'title', 'seo_title', 'seo_description', 'pitch', 'tagline', 'description', 'tags',
]

export interface SuggestContext {
  title?: string | null
  tagline?: string | null
  pitch?: string | null
  description?: string | null
  category?: string | null
  subcategory?: string | null
  jurisdiction?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
}

export type SuggestSuccess = { ok: true; value: string | string[] }
export type SuggestFailure = { ok: false; status: number; message: string }
export type SuggestResult = SuggestSuccess | SuggestFailure

interface FieldSpec {
  prompt: string
  format: 'string' | 'list'
  hardLimit?: number
}

function buildBaseContext(ctx: SuggestContext): string {
  const title = String(ctx.title || '')
  const category = String(ctx.category || '')
  const jurisdiction = String(ctx.jurisdiction || '')
  const pitch = String(ctx.pitch || ctx.tagline || '')
  const description = String(ctx.description || '')
  return [
    `Service title: ${title || '(none yet)'}`,
    category ? `Category: ${category}` : '',
    jurisdiction ? `Jurisdiction: ${jurisdiction.toUpperCase()}` : '',
    pitch ? `Existing pitch: ${pitch}` : '',
    description ? `Existing long description: ${description.slice(0, 600)}` : '',
  ].filter(Boolean).join('\n')
}

function buildFieldSpec(field: SuggestField, ctx: SuggestContext): FieldSpec {
  const baseContext = buildBaseContext(ctx)
  switch (field) {
    case 'title':
      return {
        format: 'string', hardLimit: 80,
        prompt: [
          'Write a single-line gig title for a Fiverr-style legal/immigration marketplace.',
          'Requirements: 50–75 characters, starts with "I will", action-led, includes a service noun, plain language. Do NOT include emoji, quotation marks, hashtags, or trailing punctuation.',
          'Return ONLY the title text, no labels, no markdown, no preamble.',
          '',
          'Context:',
          baseContext,
        ].join('\n'),
      }
    case 'seo_title':
      return {
        format: 'string', hardLimit: 60,
        prompt: [
          'Write a Google search-result title (≤60 characters) for this service.',
          'Requirements: front-load the primary keyword, separate brand or qualifier with " — ", no emoji, no trailing punctuation, no quotes.',
          'Return ONLY the title text.',
          '',
          'Context:',
          baseContext,
        ].join('\n'),
      }
    case 'seo_description':
      return {
        format: 'string', hardLimit: 160,
        prompt: [
          'Write a meta description (search snippet) of exactly 130–155 characters.',
          'Requirements: lead with what the buyer gets, include one concrete deliverable or proof point, end with no trailing ellipsis or quotation marks.',
          'Return ONLY the description text, single paragraph, no labels.',
          '',
          'Context:',
          baseContext,
        ].join('\n'),
      }
    case 'pitch':
    case 'tagline':
      return {
        format: 'string', hardLimit: 160,
        prompt: [
          'Write a one-sentence pitch / tagline of 60–150 characters.',
          'Requirements: client-facing, plain language, names the audience and the outcome, no emoji, no quotes.',
          'Return ONLY the pitch text.',
          '',
          'Context:',
          baseContext,
        ].join('\n'),
      }
    case 'description':
      return {
        format: 'string', hardLimit: 2400,
        prompt: [
          'Write a long-form gig description, 400–700 words, plain prose, no markdown headings.',
          'Structure:',
          '1) One opening paragraph naming the buyer and outcome.',
          '2) "What you get" paragraph listing the concrete deliverables in prose (no bullets).',
          '3) "How it works" paragraph describing the process and timeline.',
          '4) "Who it\'s for" paragraph naming the ideal client and the cases this is NOT for.',
          'No emoji. No markdown bullets. No promotional fluff. Return ONLY the description prose.',
          '',
          'Context:',
          baseContext,
        ].join('\n'),
      }
    case 'tags':
      return {
        format: 'list', hardLimit: 5,
        prompt: [
          'Suggest 5 marketplace search tags for this service.',
          'Requirements: lowercase, 1–3 words each, no punctuation other than spaces, no emoji, no hashtags.',
          'Return ONLY the tags, comma-separated on a single line. No labels, no quotes.',
          '',
          'Context:',
          baseContext,
        ].join('\n'),
      }
  }
}

function cleanString(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^\s*(?:title|seo title|description|seo description|meta description|pitch|tagline|tags?)\s*:\s*/i, '')
  s = s.replace(/^["'`]+|["'`]+$/g, '').trim()
  return s
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[,\n]+/g)
    .map((t) => t.trim().replace(/^["'`#]+|["'`]+$/g, '').toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 32)
    .slice(0, 5)
}

const SYSTEM_PROMPT = [
  'You are an SEO copywriter for a legal-services marketplace (similar to Fiverr).',
  'You produce concise, professional, conversion-focused copy that complies with the field constraints exactly.',
  'You never invent credentials, case outcomes, prices, or guarantees that were not provided in the context.',
  'Output ONLY the requested text — no markdown, no labels, no explanations.',
].join(' ')

export async function draftField(
  field: SuggestField,
  context: SuggestContext,
  hint?: string,
): Promise<SuggestResult> {
  if (!ALLOWED_FIELDS.includes(field)) {
    return { ok: false, status: 400, message: `Field "${field}" is not AI-editable.` }
  }
  const provider = getChatProvider()
  if (!provider) {
    return { ok: false, status: 503, message: 'AI assistant is not configured. Add GROQ_API_KEY or GEMINI_API_KEY to enable suggestions.' }
  }
  const spec = buildFieldSpec(field, context)
  const trimmedHint = (hint || '').trim().slice(0, 400)
  const userMessage = trimmedHint
    ? `${spec.prompt}\n\nAdditional guidance from the seller: ${trimmedHint}`
    : spec.prompt

  let raw: string
  try {
    raw = await provider.reply(SYSTEM_PROMPT, [{ role: 'user', content: userMessage }])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, message: `AI suggestion failed: ${msg}` }
  }

  if (spec.format === 'list') {
    const tags = parseTags(raw)
    if (!tags.length) return { ok: false, status: 502, message: 'Model returned no usable tags. Try again.' }
    return { ok: true, value: tags }
  }

  const cleaned = cleanString(raw)
  if (!cleaned) return { ok: false, status: 502, message: 'Model returned empty output. Try again.' }
  const limited = spec.hardLimit && cleaned.length > spec.hardLimit
    ? cleaned.slice(0, spec.hardLimit).replace(/\s+\S*$/, '')
    : cleaned
  return { ok: true, value: limited }
}
