import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { getChatProvider } from '@/lib/chatProvider'

// Fields the editor is allowed to ask AI to draft. Tied to the SEO
// checks in lib/seoUtils.ts so the editor and the suggester stay in
// lockstep — anything outside this set is rejected.
type Field =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'description' | 'tags'
const ALLOWED_FIELDS: Field[] = ['title', 'seo_title', 'seo_description', 'pitch', 'description', 'tags']

interface FieldSpec {
  prompt: string
  example: string
  format: 'string' | 'list'
  hardLimit?: number
}

function buildFieldSpec(field: Field, gig: Record<string, unknown>): FieldSpec {
  const title = String(gig.title || '')
  const category = String(gig.category || '')
  const jurisdiction = String(gig.jurisdiction || '')
  const pitch = String(gig.pitch || '')
  const description = String(gig.description || '')

  const baseContext = [
    `Service title: ${title || '(none yet)'}`,
    category ? `Category: ${category}` : '',
    jurisdiction ? `Jurisdiction: ${jurisdiction.toUpperCase()}` : '',
    pitch ? `Existing pitch: ${pitch}` : '',
    description ? `Existing long description: ${description.slice(0, 600)}` : '',
  ].filter(Boolean).join('\n')

  switch (field) {
    case 'title':
      return {
        format: 'string', hardLimit: 80,
        example: 'I will file your F-1 reinstatement application end-to-end',
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
        example: 'F-1 Reinstatement Filing — Attorney-Drafted',
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
        example: 'Attorney-drafted F-1 reinstatement filings for international students. Full case prep, statement of facts, and USCIS submission. Most cases ready in 5 days.',
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
      return {
        format: 'string', hardLimit: 160,
        example: 'Professional F-1 reinstatement support for international students facing SEVIS termination or visa status issues.',
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
        format: 'string', hardLimit: 1800,
        example: '',
        prompt: [
          'Write a long-form gig description, 350–600 words, plain prose, no markdown headings.',
          'Structure:',
          '1) One opening paragraph naming the buyer and outcome.',
          '2) "What you get" paragraph listing the concrete deliverables.',
          '3) "How it works" paragraph describing the process and timeline.',
          '4) "Who it\'s for" paragraph naming the ideal client and the cases this is NOT for.',
          'No emoji. No lists with bullets — use prose. No promotional fluff. Return ONLY the description prose.',
          '',
          'Context:',
          baseContext,
        ].join('\n'),
      }
    case 'tags':
      return {
        format: 'list', hardLimit: 5,
        example: 'visa, reinstatement, sevis, international students, immigration',
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
  // Strip leading "Title:" / "Description:" / etc. labels and trailing quotes.
  s = s.replace(/^\s*(?:title|seo title|description|seo description|meta description|pitch|tagline|tags?)\s*:\s*/i, '')
  s = s.replace(/^["'`]+|["'`]+$/g, '').trim()
  // Take the first paragraph for single-line fields (caller decides via hardLimit).
  return s
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[,\n]+/g)
    .map((t) => t.trim().replace(/^["'`#]+|["'`]+$/g, '').toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 32)
    .slice(0, 5)
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (!['attorney', 'consultant', 'admin'].includes(auth.role)) return fail('Forbidden.', 403)

  const { id } = await context.params
  const { data: gig, error: loadErr } = await auth.db.from('gigs').select('*').eq('id', id).single()
  if (loadErr || !gig) return fail('Gig not found.', 404)
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const field = String(body.field || '') as Field
  if (!ALLOWED_FIELDS.includes(field)) return fail(`Field "${field}" is not AI-editable.`, 400)
  const userHint = typeof body.hint === 'string' ? body.hint.trim().slice(0, 400) : ''

  const provider = getChatProvider()
  if (!provider) {
    return fail('AI assistant is not configured. Add GROQ_API_KEY or GEMINI_API_KEY to enable suggestions.', 503)
  }

  const spec = buildFieldSpec(field, gig)
  const system = [
    'You are an SEO copywriter for a legal-services marketplace (similar to Fiverr).',
    'You produce concise, professional, conversion-focused copy that complies with the field constraints exactly.',
    'You never invent credentials, case outcomes, prices, or guarantees that were not provided in the context.',
    'Output ONLY the requested text — no markdown, no labels, no explanations.',
  ].join(' ')

  const userMessage = userHint
    ? `${spec.prompt}\n\nAdditional guidance from the seller: ${userHint}`
    : spec.prompt

  let raw: string
  try {
    raw = await provider.reply(system, [{ role: 'user', content: userMessage }])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return fail(`AI suggestion failed: ${msg}`, 502)
  }

  if (spec.format === 'list') {
    const tags = parseTags(raw)
    if (!tags.length) return fail('Model returned no usable tags. Try again.', 502)
    return ok({ field, value: tags })
  }

  const cleaned = cleanString(raw)
  if (!cleaned) return fail('Model returned empty output. Try again.', 502)
  // Soft trim — leave the editor to enforce the final cap so the seller
  // can see how close the model came to the target.
  const limited = spec.hardLimit && cleaned.length > spec.hardLimit
    ? cleaned.slice(0, spec.hardLimit).replace(/\s+\S*$/, '')
    : cleaned
  return ok({ field, value: limited })
}
