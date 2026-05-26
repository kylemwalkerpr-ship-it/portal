// Shared SEO draft logic — used by:
//   /api/gigs/[id]/seo-suggest   (post-create inline editor)
//   /api/seo-suggest             (pre-create wizard — no gig row yet)
// Keep the prompt + post-processing here so both routes stay in lockstep.

import { getChatProvider } from './chatProvider'
import { buildSeoResearch, serializeResearch, type SeoResearch } from './seoResearch'

export type { SeoResearch, KeywordSignal } from './seoResearch'

export type SuggestField =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'tagline' | 'description' | 'tags' | 'requirements' | 'faq' | 'tier_features'

export const ALLOWED_FIELDS: SuggestField[] = [
  'title', 'seo_title', 'seo_description', 'pitch', 'tagline', 'description', 'tags', 'requirements', 'faq', 'tier_features',
]

export interface TierSummary {
  tier?: 'basic' | 'standard' | 'premium' | string
  title?: string
  price?: number
  delivery_days?: number
  revisions?: number
  features?: string[]
}

export interface FaqEntry { question: string; answer: string }

export interface SuggestContext {
  title?: string | null
  tagline?: string | null
  pitch?: string | null
  description?: string | null
  requirements?: string | null
  category?: string | null
  subcategory?: string | null
  jurisdiction?: string | null
  tags?: string[] | null
  seo_title?: string | null
  seo_description?: string | null
  faq?: FaqEntry[] | null
  // Tier-scoped fields — required only when field === 'tier_features'.
  // tier is the one being drafted, otherTiers are the rest so the model
  // can keep value ladders clean (basic doesn't promise standard's perks).
  tier?: TierSummary | null
  otherTiers?: TierSummary[] | null
}

export type SuggestSuccess = { ok: true; value: string | string[] | FaqEntry[]; research: SeoResearch }
export type SuggestFailure = { ok: false; status: number; message: string }
export type SuggestResult = SuggestSuccess | SuggestFailure

interface FieldSpec {
  prompt: string
  format: 'string' | 'list' | 'faq'
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
    case 'faq':
      return {
        format: 'faq',
        prompt: [
          'Generate 5 frequently-asked questions a buyer would have for this gig, with concise answers.',
          'Output format — exactly this shape, no markdown, no numbering:',
          '',
          'Q: <question ending with ?>',
          'A: <answer, 1–3 sentences>',
          '',
          'Q: <question>',
          'A: <answer>',
          '',
          'Rules: each Q is under 90 characters. Each A is 1–3 plain-language sentences (no bullets, no headings). Never promise specific outcomes, eligibility, refunds, or timelines that weren\'t in the context. Skip greetings. Skip closers like "Let me know if you have more questions". Return ONLY the Q/A pairs in the format above.',
          '',
          'Context:',
          baseContext,
        ].join('\n'),
      }
    case 'tier_features': {
      const t = ctx.tier ?? {}
      const tierLabel = String(t.tier || t.title || 'this tier')
      const dollars = typeof t.price === 'number' && t.price > 0 ? `$${(t.price / 100).toFixed(2)}` : 'unset'
      const days = typeof t.delivery_days === 'number' && t.delivery_days > 0 ? `${t.delivery_days} days` : 'unset'
      const revs = typeof t.revisions === 'number' ? `${t.revisions} revisions` : 'unset'
      const others = (ctx.otherTiers ?? []).filter((o) => o && (o.title || o.tier))
      const ladder = others.length
        ? others
            .map((o) => {
              const olabel = o.tier || o.title || 'tier'
              const oprice = typeof o.price === 'number' && o.price > 0 ? `$${(o.price / 100).toFixed(2)}` : '—'
              const ofeats = Array.isArray(o.features) && o.features.length
                ? o.features.slice(0, 5).join('; ')
                : '(none yet)'
              return `- ${olabel} @ ${oprice}: ${ofeats}`
            })
            .join('\n')
        : '(no other tiers configured)'

      // Tier-specific guidance: basic = entry point, standard = best-value
      // middle, premium = premium scope. We tell the model exactly how
      // to scale the bullet list so the value ladder reads cleanly.
      const tierGuidance =
        tierLabel.toLowerCase().includes('basic') || tierLabel.toLowerCase().includes('starter')
          ? 'This is the BASIC tier. Cover the minimum viable deliverable — 3–5 narrow, concrete bullets. No premium-tier perks (no rush delivery, no unlimited revisions, no add-ons).'
          : tierLabel.toLowerCase().includes('premium') || tierLabel.toLowerCase().includes('pro')
            ? 'This is the PREMIUM tier. 5–7 bullets covering the full scope. Include EVERYTHING from basic + standard, plus 2–3 premium differentiators (e.g. faster turnaround, more revisions, follow-up call, document re-submission if denied).'
            : 'This is the STANDARD / middle tier. 4–6 bullets. Strict superset of basic with 1–2 added perks. Must clearly be more than basic but less than premium.'

      return {
        format: 'list', hardLimit: 7,
        prompt: [
          'Draft the "what\'s included" feature bullets for a gig pricing tier.',
          '',
          `Tier being drafted: ${tierLabel} (${dollars}, ${days}, ${revs})`,
          '',
          `Other tiers on this gig (do NOT duplicate their bullets; keep value ladder intact):`,
          ladder,
          '',
          tierGuidance,
          '',
          'Output rules:',
          '- Return ONLY the bullets, one per line, no hyphens / dashes / numbers / bullets characters — just the text.',
          '- Each line is 3–8 words. Action-led ("Document review and feedback"). Title case OR sentence case, consistent.',
          '- Plain language. No emoji. No promotional fluff ("amazing", "fast"). No outcome promises ("guaranteed approval").',
          '- Each bullet must be a concrete deliverable, not a feeling.',
          '',
          'Context (the broader gig):',
          baseContext,
        ].join('\n'),
      }
    }
    case 'requirements':
      return {
        format: 'string', hardLimit: 1200,
        prompt: [
          'Write a "what we need from the client to begin" requirements list for this legal/immigration gig.',
          'Format: 4–8 short bullet items, each on its own line, each starting with "- " (hyphen + space).',
          'Each bullet is one concrete document, fact, or decision the seller needs before they can start work.',
          'Plain language. No emoji. No headings. No closing paragraph. Do NOT promise outcomes, timelines, or eligibility.',
          'Examples of good bullets: "- Current visa status and date of last entry", "- Form I-20 (front and back)", "- Description of the events that led to the SEVIS termination".',
          'Return ONLY the bullet list.',
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

// Tier feature bullets are sentences, not hashtags — they're allowed to
// be longer and there are up to 7 of them. Strip any markdown bullet
// markers the model may have prepended despite our instructions.
function parseFeatureBullets(raw: string): string[] {
  return raw
    .split(/\r?\n/g)
    .map((line) => line.replace(/^[\s\-•*·\d.)\]]+/, '').replace(/^["'`]+|["'`]+$/g, '').trim())
    .filter((line) => line.length >= 3 && line.length <= 120)
    .slice(0, 7)
}

// Parse the model's Q: / A: block into structured pairs. We're
// tolerant of small format drift: bold/markdown markers around the
// Q/A labels, numeric prefixes, extra blank lines, or "Question:" /
// "Answer:" alternatives. Anything that doesn't pair cleanly is
// dropped on the floor rather than failing the whole response.
function parseFaq(raw: string): FaqEntry[] {
  const lines = raw.split(/\r?\n/).map((l) => l.trim())
  const entries: FaqEntry[] = []
  let pendingQ: string | null = null
  const qHead = /^(?:\d+[.)]\s*)?[*_]*\s*(?:Q|Question)\s*\d*\s*[:.\-]\s*[*_]*\s*/i
  const aHead = /^[*_]*\s*(?:A|Answer)\s*\d*\s*[:.\-]\s*[*_]*\s*/i
  for (const line of lines) {
    if (!line) continue
    if (qHead.test(line)) {
      pendingQ = line.replace(qHead, '').replace(/[*_]+$/g, '').trim()
    } else if (aHead.test(line) && pendingQ) {
      const answer = line.replace(aHead, '').replace(/[*_]+$/g, '').trim()
      if (pendingQ.length >= 4 && answer.length >= 4) {
        entries.push({
          question: pendingQ.slice(0, 200),
          answer: answer.slice(0, 600),
        })
      }
      pendingQ = null
    } else if (entries.length > 0 && !pendingQ) {
      // Continuation of the previous answer (multi-line response). Append
      // to the last entry's answer with a space.
      const last = entries[entries.length - 1]
      if (last.answer.length + line.length + 1 <= 600) {
        last.answer = `${last.answer} ${line}`.trim()
      }
    }
  }
  return entries.slice(0, 8)
}

const SYSTEM_PROMPT = [
  'You are an SEO copywriter for a legal-services marketplace (similar to Fiverr).',
  'You are SEO-led — every draft you produce is grounded in the SEO research brief the user message includes. You do NOT invent keywords, search-volume claims, or trend statements. You only work with the priority keywords and rules in the brief.',
  'You produce concise, professional, conversion-focused copy that complies with the field constraints exactly.',
  'You never invent credentials, case outcomes, prices, or guarantees that were not provided in the context.',
  'You match the jurisdiction phrasing in the brief exactly (e.g. "USCIS" for US gigs, "Home Office" for UK gigs, "IRCC" for Canada gigs).',
  'Output ONLY the requested text — no markdown, no labels, no explanations, no headings unless the field requires them.',
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
  // Always inject the SEO research brief BEFORE the field-specific
  // prompt so the model treats the keyword list as a constraint, not
  // an afterthought. The brief is deterministic and grounded — no
  // hallucinated keywords can sneak in this path.
  const research = buildSeoResearch({
    title: context.title,
    pitch: context.pitch,
    tagline: context.tagline,
    description: context.description,
    seo_title: context.seo_title,
    seo_description: context.seo_description,
    category: context.category,
    jurisdiction: context.jurisdiction,
    tags: context.tags,
  })
  const researchBlock = serializeResearch(research)
  const userMessage = [
    researchBlock,
    '',
    '## Task',
    spec.prompt,
    trimmedHint ? `\nAdditional guidance from the seller: ${trimmedHint}` : '',
  ].join('\n')

  let raw: string
  try {
    raw = await provider.reply(SYSTEM_PROMPT, [{ role: 'user', content: userMessage }])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, message: `AI suggestion failed: ${msg}` }
  }

  if (spec.format === 'list') {
    // Two list-shaped fields with very different content rules:
    //   tags = short, lowercase, max 5
    //   tier_features = sentence-length bullets, max 7
    const items = field === 'tier_features' ? parseFeatureBullets(raw) : parseTags(raw)
    if (!items.length) {
      const noun = field === 'tier_features' ? 'feature bullets' : 'tags'
      return { ok: false, status: 502, message: `Model returned no usable ${noun}. Try again.` }
    }
    return { ok: true, value: items, research }
  }

  if (spec.format === 'faq') {
    const entries = parseFaq(raw)
    if (!entries.length) return { ok: false, status: 502, message: 'Model returned no usable Q&A pairs. Try again.' }
    return { ok: true, value: entries, research }
  }

  const cleaned = cleanString(raw)
  if (!cleaned) return { ok: false, status: 502, message: 'Model returned empty output. Try again.' }
  const limited = spec.hardLimit && cleaned.length > spec.hardLimit
    ? cleaned.slice(0, spec.hardLimit).replace(/\s+\S*$/, '')
    : cleaned
  return { ok: true, value: limited, research }
}
