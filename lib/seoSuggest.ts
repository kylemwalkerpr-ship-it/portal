// Shared SEO draft logic — used by:
//   /api/gigs/[id]/seo-suggest   (post-create inline editor)
//   /api/seo-suggest             (pre-create wizard — no gig row yet)
// Keep the prompt + post-processing here so both routes stay in lockstep.

import { getChatProvider } from './chatProvider'
import { buildSeoResearchAsync, serializeResearch, type SeoResearch } from './seoResearch'
import { getCategoryById, getCategoryBySubcategoryId, getSubcategoryById } from './categories'
import { getStrategyDirectivesBlock } from './seoKnowledgeBase'

export type { SeoResearch, KeywordSignal } from './seoResearch'

export type SuggestField =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'tagline' | 'description' | 'tags' | 'requirements' | 'faq' | 'tier_features'

export const ALLOWED_FIELDS: SuggestField[] = [
  'title', 'seo_title', 'seo_description', 'pitch', 'tagline', 'description', 'tags', 'requirements', 'faq', 'tier_features',
]

// Per-role allow-list. All fields apply to both roles today, but the wrapper
// is the boundary that lets us split future role-specific fields cleanly —
// the same pattern that saved us when an attorney requested a consultant-only
// profile field. Both routes enforce this against the auth'd role.
export type SuggestRole = 'attorney' | 'consultant'
export function allowedFieldsForRole(_role: SuggestRole): SuggestField[] {
  return ALLOWED_FIELDS
}

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
  // Seller role drives prompt language. Attorney prompts retain
  // jurisdiction/USCIS/Home Office/IRCC anchors; consultant prompts swap to
  // neutral country/region + professional-services framing so consultants
  // can't be pushed into drafting legal-coded copy for fields their gig
  // can't legally ship. Default 'attorney' for backward compatibility with
  // callers that pre-date the role split.
  role?: SuggestRole | null
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
  // Regeneration support. When the caller wants a NEW draft (not the same
  // text again), it sends the previous output here so the prompt can
  // instruct the model to produce a distinct alternative. The model is
  // told to vary the opening, angle, structure, and word choices.
  previousValue?: string | null
}

export type SuggestSuccess = { ok: true; value: string | string[] | FaqEntry[]; research: SeoResearch }
export type SuggestFailure = { ok: false; status: number; message: string }
export type SuggestResult = SuggestSuccess | SuggestFailure

interface FieldSpec {
  prompt: string
  format: 'string' | 'list' | 'faq'
  hardLimit?: number
}

function isConsultant(ctx: SuggestContext): boolean {
  return ctx.role === 'consultant'
}

function buildBaseContext(ctx: SuggestContext, field?: SuggestField): string {
  const title = String(ctx.title || '')
  const category = String(ctx.category || '')
  const subcategory = String(ctx.subcategory || '')
  const jurisdiction = String(ctx.jurisdiction || '')
  const pitch = String(ctx.pitch || ctx.tagline || '')
  const description = String(ctx.description || '')
  const consultant = isConsultant(ctx)

  // Resolve the taxonomy node the seller picked so the prompt carries
  // a real category brief — name, scope, curated keyword chips — not
  // just an opaque slug. This is what keeps the AI draft coherent
  // across title, pitch, tags, SEO meta, FAQ, and long description.
  const subNode = subcategory
    ? (getSubcategoryById(category, subcategory) ?? (() => {
        const parent = getCategoryBySubcategoryId(subcategory)
        return parent ? getSubcategoryById(parent.id, subcategory) : undefined
      })())
    : undefined
  const catNode = getCategoryById(category)
    ?? (subNode ? getCategoryBySubcategoryId(subcategory) : undefined)
  const anchorKeywords = subNode?.keywords?.length
    ? subNode.keywords
    : catNode
      ? Array.from(new Set(catNode.subcategories.flatMap((s) => s.keywords))).slice(0, 12)
      : []
  const categoryBrief = (() => {
    if (!catNode && !subNode) return ''
    const lines: string[] = []
    if (catNode) lines.push(`- Category: ${catNode.name} — ${catNode.description}`)
    if (subNode) lines.push(`- Subcategory: ${subNode.name} — ${subNode.description}`)
    if (anchorKeywords.length) lines.push(`- Anchor keywords (use only these — do not invent): ${anchorKeywords.join(', ')}`)
    return ['### Category brief (taxonomy scope)', ...lines].join('\n')
  })()
  // Surface the seller's whole gig surface — tags, FAQ snapshot, and tier
  // pricing/delivery — so the model has every CTR signal it needs. Tier
  // pricing in particular drives "from $X · Y-day delivery" snippets that
  // feed both the SEO description prose AND the Offer/AggregateOffer schema
  // emitted on the public page.
  const tags = Array.isArray(ctx.tags) ? ctx.tags.filter(t => typeof t === 'string' && t.trim()) : []
  const faq = Array.isArray(ctx.faq) ? ctx.faq.filter(f => f?.question && f?.answer) : []
  const tiers = Array.isArray(ctx.otherTiers)
    ? [...(ctx.tier ? [ctx.tier] : []), ...ctx.otherTiers]
    : (ctx.tier ? [ctx.tier] : [])
  const activeTiers = tiers.filter(t => typeof t?.price === 'number' && (t!.price as number) > 0)
  const tierSummary = activeTiers
    .map(t => {
      const label = String(t.tier || t.title || 'tier')
      const price = typeof t.price === 'number' ? `$${(t.price / 100).toFixed(2)}` : '—'
      const days = typeof t.delivery_days === 'number' && t.delivery_days > 0 ? `${t.delivery_days}d delivery` : ''
      const revs = typeof t.revisions === 'number' && t.revisions > 0 ? `${t.revisions} revisions` : ''
      return [label, price, days, revs].filter(Boolean).join(' · ')
    })
    .join(' | ')
  // Primary tier = the cheapest active tier. Its price + delivery becomes
  // the locked "from $X · Yd" anchor every field has to respect — without
  // this, the SEO description might quote one price, the FAQ another, and
  // the long description a third, breaking the listing's coherence.
  const primaryTier = activeTiers.slice().sort((a, b) => (a.price ?? 0) - (b.price ?? 0))[0]
  const primaryAnchor = primaryTier
    ? `from $${((primaryTier.price as number) / 100).toFixed(0)}${typeof primaryTier.delivery_days === 'number' && primaryTier.delivery_days > 0 ? ` · ${primaryTier.delivery_days}-day delivery` : ''}`
    : ''

  // === GIG SPINE ===
  // Locked identity that holds across every field draft in this listing.
  // The LLM must treat all fields as ONE coherent service description —
  // not independent prompts. Spine first, drafted-already second,
  // taxonomy brief third — that order is deliberate: identity → memory
  // → scope. Same order every call, so the model anchors the same way
  // whether the seller is drafting field 1 or field 9.
  const spineLines: string[] = [
    `- Role: ${consultant ? 'Non-legal consultant (professional-services marketplace — Fiverr-style)' : 'Licensed attorney (legal-services marketplace — Fiverr-style)'}`,
  ]
  if (catNode) spineLines.push(`- Service line: ${catNode.name}${subNode ? ` → ${subNode.name}` : ''}`)
  if (jurisdiction) {
    spineLines.push(consultant
      ? `- Country / region served: ${jurisdiction.toUpperCase()} (no legal-system anchors)`
      : `- Jurisdiction: ${jurisdiction.toUpperCase()}`)
  }
  if (anchorKeywords.length) {
    spineLines.push(`- Locked vocabulary (use these; do NOT introduce out-of-scope terms): ${anchorKeywords.join(', ')}`)
  }
  if (primaryAnchor) spineLines.push(`- Locked pricing anchor (must be consistent across every field): ${primaryAnchor}`)
  spineLines.push('- Voice: one consultant, one service, one buyer — write as if every field is a paragraph of the same sales page. Do NOT introduce a different audience, deliverable, jurisdiction, price, or angle than what already appears in this spine or the already-drafted fields below.')

  // === ALREADY DRAFTED ===
  // What the seller already has in the form. The model must REINFORCE
  // these, not contradict them — same voice, same claims, same buyer.
  // Empty lines are suppressed so the model isn't told a field "exists"
  // when it doesn't, which would invite hallucinated reinforcement.
  const draftedLines: string[] = []
  if (title) draftedLines.push(`- Title: ${title}`)
  if (pitch) draftedLines.push(`- Pitch / tagline: ${pitch}`)
  if (tags.length) draftedLines.push(`- Tags: ${tags.join(', ')}`)
  if (tierSummary) draftedLines.push(`- Pricing tiers: ${tierSummary}`)
  if (ctx.seo_title) draftedLines.push(`- SEO title: ${ctx.seo_title}`)
  if (ctx.seo_description) draftedLines.push(`- SEO description: ${ctx.seo_description}`)
  if (faq.length) draftedLines.push(`- FAQ topics: ${faq.slice(0, 5).map(f => f.question).join(' | ')}`)
  if (description) draftedLines.push(`- Long description excerpt: ${description.slice(0, 600)}`)
  const alreadyDrafted = draftedLines.length
    ? ['### Already drafted (reinforce — do NOT contradict)', ...draftedLines].join('\n')
    : '### Already drafted\n- (nothing yet — your draft sets the spine; subsequent fields will be anchored to it)'

  // === SITEWIDE SEO DIRECTIVES ===
  // Distilled from /SEO strategies/SEO_STRATEGY_Q3_2026.md via
  // lib/seoKnowledgeBase.ts. Surfaces the quarterly strategic
  // keywords (cluster-aligned to the gig's category × jurisdiction),
  // the banned-phrase list, the field-appropriate structural
  // requirements (5-question test for descriptions, FAQ snippet
  // rules, etc.), and the freshness directive. Injected on every
  // call so the model self-censors and self-structures at generation
  // time rather than relying on a post-hoc audit.
  const strategyDirectives = (category && jurisdiction && field)
    ? getStrategyDirectivesBlock({
        field,
        category,
        subcategory,
        jurisdiction,
        role: consultant ? 'consultant' : 'attorney',
      })
    : ''

  return [
    '### Gig spine (locked across ALL fields)',
    ...spineLines,
    '',
    alreadyDrafted,
    '',
    categoryBrief,
    categoryBrief && strategyDirectives ? '' : '',
    strategyDirectives,
  ].filter(Boolean).join('\n')
}

function buildFieldSpec(field: SuggestField, ctx: SuggestContext): FieldSpec {
  const baseContext = buildBaseContext(ctx, field)
  const consultant = isConsultant(ctx)
  // Role-aware vocabulary anchors used across multiple field prompts.
  const marketplaceLabel = consultant ? 'Fiverr-style professional-services marketplace' : 'Fiverr-style legal-services marketplace'
  const regionAnchor = consultant
    ? 'When the brief lists a country/region (US / UK / Canada), include it verbatim — do NOT add legal-system anchors like USCIS / Home Office / IRCC for a consultant gig.'
    : 'When the brief lists a jurisdiction, use the precise legal-system anchor it implies (USCIS / Home Office / IRCC) plus the abbreviation (US / UK / Canada).'
  const proofExamples = consultant
    ? '"delivered by a verified consultant", "completed in 5 business days", "covers application strategy and editorial review"'
    : '"drafted by a licensed immigration attorney", "filed in 5 business days", "covers RFE responses"'
  switch (field) {
    case 'title':
      return {
        format: 'string', hardLimit: 80,
        prompt: [
          `Write a single-line gig title for a ${marketplaceLabel}.`,
          'Requirements: 50–75 characters, starts with "I will", action-led, includes a service noun, plain language. Do NOT include emoji, quotation marks, hashtags, or trailing punctuation.',
          consultant
            ? 'Do not imply legal practice ("attorney", "lawyer", "law firm", "legal counsel") — this is a consultant gig, not a licensed legal service.'
            : '',
          'Return ONLY the title text, no labels, no markdown, no preamble.',
          '',
          'Context:',
          baseContext,
        ].filter(Boolean).join('\n'),
      }
    case 'seo_title':
      return {
        format: 'string', hardLimit: 60,
        prompt: [
          'Write a Google search-result title (50–60 characters) for this service.',
          'Requirements:',
          '- Lead with the primary keyword from the priority list (verbatim or near-verbatim) — it must appear in the first 30 characters.',
          '- Include the country/jurisdiction abbreviation (US / UK / Canada) when the brief lists one.',
          '- Separate brand or qualifier with " — " (em dash + spaces).',
          '- NEVER start with "I will", "We will", or any pronoun + verb preamble. This is a Google title, not a marketplace gig title.',
          '- No emoji, no trailing punctuation, no quotes.',
          consultant ? '- Do not imply legal practice ("attorney", "lawyer", "law firm").' : '',
          'Return ONLY the title text.',
          '',
          'Context:',
          baseContext,
        ].filter(Boolean).join('\n'),
      }
    case 'seo_description':
      return {
        format: 'string', hardLimit: 160,
        prompt: [
          'Write a meta description (search snippet) of 140–155 characters.',
          'Requirements:',
          '- The primary keyword from the priority list appears in the first 60 characters.',
          regionAnchor,
          `- One concrete deliverable or proof point named (e.g. ${proofExamples}).`,
          '- If the brief lists a pricing tier (e.g. "from $99 · 5-day delivery"), include the starting price or delivery promise — it lifts CTR and feeds the Offer schema.',
          '- Ends with a soft CTA fragment ("Start today.", "Get a quote.", "Book a consult."). No trailing ellipsis or quotation marks.',
          consultant ? '- Do not imply legal advice or representation; this is a non-legal consulting service.' : '',
          'Return ONLY the description text, single paragraph, no labels.',
          '',
          'Context:',
          baseContext,
        ].filter(Boolean).join('\n'),
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
          'Write a long-form gig description, 500–700 words, plain prose, no markdown headings.',
          'SEO placement rules (non-negotiable):',
          '- Primary keyword from the priority list appears in the FIRST sentence of paragraph 1.',
          consultant
            ? '- The country / region (US / UK / Canada) the seller works in appears in paragraph 1 and paragraph 3. Do NOT use legal-system anchors (USCIS / Home Office / IRCC) — this is a non-legal consulting gig.'
            : '- Jurisdiction (USCIS / Home Office / IRCC, or US / UK / Canada) appears in paragraph 1 and paragraph 3.',
          '- 2–3 secondary priority keywords woven naturally across paragraphs 2–4 (max one occurrence per keyword per 100 words; no stuffing).',
          'Structure:',
          consultant
            ? '1) Opening paragraph (60–100 words): name the buyer, the outcome, and the primary keyword. Match the buyer\'s search intent — not "I will help…" but "If you are applying to / planning a / preparing for…".'
            : '1) Opening paragraph (60–100 words): name the buyer, the outcome, and the primary keyword. Match the buyer\'s search intent — not "I will help…" but "If you are filing an X / facing a Y…".',
          '2) "What you get" paragraph (100–150 words): concrete deliverables in prose, no bullets.',
          '3) "How it works" paragraph (100–150 words): process, timeline, what the buyer does at each step.',
          '4) "Who it\'s for" paragraph (100–150 words): ideal client + cases this is NOT for. Honest scoping helps qualified-lead quality and reduces refunds.',
          consultant
            ? 'No emoji. No markdown bullets. No promotional fluff ("amazing", "guaranteed", "world-class"). No legal-advice or representation language ("I represent…", "your case", "filing on your behalf") — this is a consulting/document-prep gig, not a legal service. No outcome promises. Return ONLY the description prose.'
            : 'No emoji. No markdown bullets. No promotional fluff ("amazing", "guaranteed", "world-class"). No outcome promises. Return ONLY the description prose.',
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
          'Tag mix (aim for this distribution across the 5 tags):',
          '- 1 head term — the primary keyword from the priority list (e.g. "asylum application").',
          '- 2 long-tail variants — primary keyword + intent or document modifier (e.g. "asylum application help", "i-589 form drafting").',
          '- 1 jurisdiction-tagged variant — primary keyword + jurisdiction (e.g. "us asylum filing", "uk spouse visa").',
          '- 1 related secondary keyword pulled from the priority list (do NOT invent — must appear in the brief).',
          'Format: lowercase, 1–3 words each, no punctuation other than spaces, no emoji, no hashtags.',
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
          'SEO requirements (these FAQs feed FAQPage schema for rich snippets — they must read as standalone answers):',
          '- Each question is phrased like a real Google search: starts with "How", "Can", "Do", "What", "When", "Is", or "Will".',
          consultant
            ? '- At least 2 questions include the country/region (US / UK / Canada) the seller works in. Do NOT use legal-system anchors (USCIS / Home Office / IRCC) — this is a non-legal consulting gig.'
            : '- At least 2 questions include the jurisdiction (US / UK / Canada or USCIS / Home Office / IRCC).',
          '- At least 2 questions include a priority keyword from the brief (verbatim or close variant).',
          '- Each answer is a self-contained snippet: opens with the answer (no "Yes, but…" hedging), no "see above", no pronoun back-references to earlier Q/A.',
          consultant
            ? '- Do not give legal advice or imply legal representation; if a buyer should consult a licensed attorney, say so plainly.'
            : '',
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
          consultant
            ? 'Write a "what we need from the client to begin" requirements list for this professional-services gig.'
            : 'Write a "what we need from the client to begin" requirements list for this legal/immigration gig.',
          'Format: 4–8 short bullet items, each on its own line, each starting with "- " (hyphen + space).',
          'Each bullet is one concrete document, fact, or decision the seller needs before they can start work.',
          'Plain language. No emoji. No headings. No closing paragraph. Do NOT promise outcomes, timelines, or eligibility.',
          consultant
            ? 'Examples of good bullets: "- Target programs and application deadlines", "- Current draft of your statement of purpose (if any)", "- Transcript / CV / portfolio links".'
            : 'Examples of good bullets: "- Current visa status and date of last entry", "- Form I-20 (front and back)", "- Description of the events that led to the SEVIS termination".',
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

function buildSystemPrompt(role: SuggestRole): string {
  const consultant = role === 'consultant'
  return [
    consultant
      ? 'You are an SEO copywriter for a professional-services marketplace (similar to Fiverr) covering academic, career, business, settlement, and mentorship consulting. You write for verified consultants, not licensed legal practitioners.'
      : 'You are an SEO copywriter for a legal-services marketplace (similar to Fiverr).',
    'You are SEO-led — every draft you produce is grounded in the SEO research brief the user message includes. You do NOT invent keywords, search-volume claims, or trend statements. You only work with the priority keywords and rules in the brief.',
    'COHERENCE: You are NOT drafting a standalone field. Every call you receive is ONE field of a multi-field gig listing (title, pitch, tags, SEO title, SEO description, long description, tier features, FAQ). The user message will include a "Gig spine" block (locked identity: role, service line, jurisdiction, vocabulary, pricing anchor) and an "Already drafted" block (what the seller has filled so far). Treat the gig as one continuous service description — your draft must reinforce, not contradict, the spine and the already-drafted fields. Do not introduce a new buyer, a new deliverable, a new jurisdiction, a new price, or a new angle.',
    'You produce concise, professional, conversion-focused copy that complies with the field constraints exactly.',
    'You never invent credentials, case outcomes, prices, or guarantees that were not provided in the context.',
    consultant
      ? 'You match the country/region phrasing in the brief exactly (US / UK / Canada). You do NOT use legal-system anchors like "USCIS", "Home Office", or "IRCC" — those imply legal practice, which a consultant gig cannot ship.'
      : 'You match the jurisdiction phrasing in the brief exactly (e.g. "USCIS" for US gigs, "Home Office" for UK gigs, "IRCC" for Canada gigs).',
    consultant
      ? 'You never imply legal advice or representation. If a buyer needs a licensed attorney, say so plainly.'
      : '',
    'Output ONLY the requested text — no markdown, no labels, no explanations, no headings unless the field requires them.',
  ].filter(Boolean).join(' ')
}

// Field-agnostic SEO craft rules. Injected after the research brief
// (which supplies the keywords) and before the per-field task (which
// supplies the shape). Order matters: research → playbook → task means
// the model has the words, the rules of engagement, then the spec.
const SEO_PLAYBOOK = [
  '## SEO craft rules — apply to every draft',
  '0. Coherence with the spine and already-drafted fields is mandatory. Before you write, mentally scan the "Gig spine" and "Already drafted" blocks above. The buyer, the deliverable, the jurisdiction, the price anchor, and the voice MUST match. If a tier price ($X) is given, your prose may not quote a different price. If the title names a specific document or form, your draft must reference the same one. If the spine sets a country, do not switch to a different country. Reinforce, do not riff.',
  '1. Primary keyword = the first entry in the priority list above. Use it verbatim where it fits; use a close variant elsewhere. Place it in the first 60 characters of any prose field.',
  '2. Match search intent, not seller phrasing. Buyers type "draft I-589 asylum application", not "I will help you draft". For seo_title, description, and FAQ questions, lead with the buyer\'s phrasing — the public title field is the only place "I will…" belongs.',
  '3. Jurisdiction modifier is non-negotiable. If the brief lists a jurisdiction, the abbreviation OR full name appears in: seo_title, seo_description, opening paragraph of description, and ≥2 FAQ entries.',
  '4. Semantic density without stuffing. Across description + FAQ, place 2–3 secondary priority keywords in natural sentences. Cap at one occurrence per ~100 words per term.',
  '5. FAQ entries are FAQ-schema fodder. Each question must be phrasable as a real Google search ("how long…", "can I…", "do I need…", "what happens if…"). Each answer must read as a standalone snippet — no "see above", no pronoun back-references.',
  '6. CTR phrasing. seo_title and seo_description should feel like a direct answer to the buyer\'s query — concrete deliverable + jurisdiction beats clever wordplay every time.',
  '7. Length floors. Long-form description targets 500–700 words; seo_description targets 140–155 chars; FAQ targets 5+ entries. Shorter = thinner = lower ranking.',
].join('\n')

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
  // Regeneration support: when the caller sends the previous draft text we
  // tell the model to produce a DISTINCT alternative — different angle,
  // opening, structure, word choices. Plus a per-call style cue so even
  // without a previousValue two identical calls produce different output
  // (temperature is low; without variance two clicks return the same text).
  const previousValue = context.previousValue
  const previousBlock = typeof previousValue === 'string' && previousValue.trim()
    ? [
        '',
        '## Previous draft (do NOT repeat)',
        previousValue.trim().slice(0, 1500),
        '',
        'Produce a DISTINCT alternative. Specifically vary: the opening sentence/structure, the angle taken, the word choices, and which secondary keywords you weave in. The new draft must read as a meaningfully different option — not a paraphrase.',
      ].join('\n')
    : ''
  const STYLE_CUES = [
    'lead with a buyer outcome, not the seller',
    'open with a concrete document or form name',
    'open with a question the buyer would type into Google',
    'open with a timing or deadline detail',
    'lead with the strongest credential or proof point',
    'open with the audience this is for',
  ]
  const styleCue = STYLE_CUES[Math.floor(Math.random() * STYLE_CUES.length)]
  const role: SuggestRole = context.role === 'consultant' ? 'consultant' : 'attorney'
  // Always inject the SEO research brief BEFORE the field-specific
  // prompt so the model treats the keyword list as a constraint, not
  // an afterthought. The brief is deterministic and grounded — no
  // hallucinated keywords can sneak in this path. Role is passed through
  // so the research layer can pick role-appropriate intent modifiers
  // (attorney/lawyer for legal gigs; specialist/advisor/coach for consultants).
  // Async variant queries Google Search Console for live keyword
  // signals (28-day impressions for this category × jurisdiction).
  // When GSC creds aren't on the workspace it returns the same shape
  // the sync builder produces — every caller stays safe.
  const research = await buildSeoResearchAsync({
    role,
    title: context.title,
    pitch: context.pitch,
    tagline: context.tagline,
    description: context.description,
    seo_title: context.seo_title,
    seo_description: context.seo_description,
    category: context.category,
    subcategory: context.subcategory,
    jurisdiction: context.jurisdiction,
    tags: context.tags,
  })
  const researchBlock = serializeResearch(research)
  const userMessage = [
    researchBlock,
    '',
    SEO_PLAYBOOK,
    '',
    `## Style cue for this draft\nFor this specific draft, ${styleCue}.`,
    '',
    '## Task',
    spec.prompt,
    trimmedHint ? `\nAdditional guidance from the seller: ${trimmedHint}` : '',
    previousBlock,
  ].filter(Boolean).join('\n')

  let raw: string
  try {
    raw = await provider.reply(buildSystemPrompt(role), [{ role: 'user', content: userMessage }])
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
