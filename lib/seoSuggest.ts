// Shared SEO draft logic — used by:
//   /api/gigs/[id]/seo-suggest   (post-create inline editor)
//   /api/seo-suggest             (pre-create wizard — no gig row yet)
// Keep the prompt + post-processing here so both routes stay in lockstep.

import { getChatProvider } from './chatProvider'
import { buildSeoResearchAsync, serializeResearch, type SeoResearch } from './seoResearch'
import { getCategoryById, getCategoryBySubcategoryId, getSubcategoryById } from './categories'
import { getStrategyDirectivesBlock } from './seoKnowledgeBase'
import {
  VOICE_PLAYBOOK,
  KEYWORD_WEAVING_PLAYBOOK,
  getBannedAiTellsBlock,
  getFieldToneScaffold,
  type FieldName,
} from './seoVoice'

export type { SeoResearch, KeywordSignal } from './seoResearch'

export type SuggestField =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'tagline' | 'description' | 'tags' | 'requirements' | 'faq'
  | 'tier_features' | 'tier_description'

export const ALLOWED_FIELDS: SuggestField[] = [
  'title', 'seo_title', 'seo_description', 'pitch', 'tagline', 'description', 'tags', 'requirements', 'faq',
  'tier_features', 'tier_description',
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
        format: 'string', hardLimit: 78,
        prompt: [
          `Write a single-line gig title for a ${marketplaceLabel}.`,
          'HARD RULES (the title MUST be complete and self-contained — no mid-sentence cuts):',
          '- 55–75 characters TOTAL. Count them as you write.',
          '- Starts with "I will".',
          '- Ends with a NOUN, a NOUN PHRASE, or a complete prepositional phrase ("for US college applications", "in 72 hours", "for graduate-school applicants"). NEVER ends with a preposition ("of", "for", "to", "in", "with", "from", "as"), a conjunction ("and", "or", "but"), or an article ("a", "an", "the").',
          '- Reads as a complete sentence even without a period. If you cut at the character limit, the title would still make grammatical sense.',
          '- Action-led, names one service noun, plain language. No emoji, no quotation marks, no hashtags, no trailing punctuation.',
          'CHECK BEFORE RETURNING: re-read your title silently. Does the last word complete the thought? If the last word is "of", "and", "for", "to", "the", or any other dangling word, you have written too long — REWRITE the title shorter so the last word is a noun or a complete phrase.',
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
          'Generate 8–10 frequently-asked questions a buyer would have BEFORE booking this gig, with comprehensive answers. These FAQs feed FAQPage schema for rich snippets — they must read as a coherent buyer-decision sequence, not random unrelated questions.',
          '',
          'INTENT-DIVERSITY REQUIREMENT (you MUST cover all 6 of these decision categories — that\'s what separates a real FAQ from a disjointed list):',
          '  1. SCOPE: "What exactly do you do?" / "What\'s included?" / "What document types do you handle?" — buyer learning the deliverable boundaries',
          '  2. PROCESS: "How does it work?" / "What\'s the process?" / "How many rounds of edits?" — buyer understanding the workflow',
          '  3. TIMING: "How long does it take?" / "Can you do a rush turnaround?" — buyer matching to their deadline',
          '  4. PRICING / VALUE: "How much does it cost?" / "What if I need more revisions?" — buyer evaluating fit-to-budget',
          '  5. ELIGIBILITY: "Can you help with [specific situation]?" / "Do you work with [audience]?" — buyer checking self-applicability',
          '  6. PROOF / RISK: "What\'s your background?" / "What if I\'m not satisfied?" / "Have you worked on [school/program] before?" — buyer reducing risk',
          'Distribute the 8–10 questions across these 6 categories. NO two questions in the same category should ask the same underlying thing. NO unrelated/random questions outside these categories.',
          '',
          'EACH QUESTION must:',
          '- Read like a real Google search query a buyer would type. Starts with "How", "Can", "Do", "What", "When", "Is", "Will", "Are", "How much", "How long".',
          '- Tie directly to the gig\'s actual scope (the category brief + already-drafted spine above). No questions about unrelated services. No questions the seller can\'t answer.',
          '- Be under 95 characters.',
          consultant
            ? '- Across the 8–10 questions, at least 2 reference the country/region (US / UK / Canada). Do NOT use legal-system anchors (USCIS / Home Office / IRCC) — non-legal consulting gig.'
            : '- Across the 8–10 questions, at least 2 reference the jurisdiction (US / UK / Canada or USCIS / Home Office / IRCC).',
          '- Across the 8–10 questions, at least 3 weave in priority keywords from the SEO brief (verbatim or close variant).',
          '',
          'EACH ANSWER must:',
          '- Be a standalone featured-snippet candidate. First sentence is 40–60 words and answers the question directly (no "Yes, but…", no "Great question!", no "It depends." opener — open with the substantive answer).',
          '- Read independently of every other Q/A pair. No "see above", no pronoun back-references ("as mentioned"), no "in addition to what I said".',
          '- End with a concrete next step where natural (a document name, a controlling source, a specific CTA — "Send me the school name and I\'ll quote a turnaround").',
          '- Be 2–4 plain-language sentences total. No bullets, no headings, no markdown.',
          '- Never promise outcomes, refunds, eligibility, or timelines that weren\'t in the gig context.',
          consultant
            ? '- Do not give legal advice or imply legal representation; if the buyer needs a licensed attorney, say so plainly.'
            : '',
          '',
          'Output format — exactly this shape, no markdown, no numbering, no Q1/Q2 labels:',
          '',
          'Q: <question ending with ?>',
          'A: <answer, 2–4 sentences>',
          '',
          'Q: <question>',
          'A: <answer>',
          '',
          '(repeat 8–10 times, one blank line between pairs)',
          '',
          'Skip greetings. Skip closers like "Let me know if you have more questions". Return ONLY the Q/A pairs.',
          '',
          'Context:',
          baseContext,
        ].filter(Boolean).join('\n'),
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
              const orevs = typeof o.revisions === 'number' ? `${o.revisions} revisions` : '? revisions'
              const odays = typeof o.delivery_days === 'number' ? `${o.delivery_days}d` : '?d'
              return `- ${olabel} @ ${oprice} (${odays}, ${orevs}): ${ofeats}`
            })
            .join('\n')
        : '(no other tiers configured)'

      // Tier-specific guidance with EXPLICIT differentiation rules. The
      // value ladder must add 1-2 NEW benefits at each tier-up step —
      // never just "more of the same". Standard inclusions (plagiarism
      // report, AI-content scan, title page, formatting check) appear
      // across ALL tiers, but premium-only perks (rush turnaround, 1-on-1
      // call, re-submission support) appear only at their gated tier.
      const tierGuidance =
        tierLabel.toLowerCase().includes('basic') || tierLabel.toLowerCase().includes('starter')
          ? 'This is the BASIC tier — entry point. 3–5 bullets covering the minimum viable deliverable + the 2-3 standard inclusions every buyer expects (originality / AI-content report, basic formatting check, 1 revision round within 7 days of delivery). NO premium perks (no rush turnaround, no 1-on-1 call, no re-submission support).'
          : tierLabel.toLowerCase().includes('premium') || tierLabel.toLowerCase().includes('pro')
            ? 'This is the PREMIUM tier — top of the ladder. 5–7 bullets that are a STRICT SUPERSET of standard + 2–3 premium-only differentiators. The premium differentiators MUST be tier-up perks the buyer cannot get at standard (e.g. priority turnaround, 1-on-1 strategy call, free re-submission if rejected, broader scope cap, dedicated post-delivery window). Standard inclusions still appear with the better bounds appropriate to premium (e.g. "3 revision rounds within 21 days" rather than "1 round within 7").'
            : 'This is the STANDARD / middle tier — the best-value choice. 4–6 bullets that are a STRICT SUPERSET of basic + 1–2 standard-only perks (typically: more revision rounds within a longer window, citation list or bibliography, rush-turnaround option). Must clearly be more than basic but less than premium.'

      return {
        format: 'list', hardLimit: 7,
        prompt: [
          'Draft the "what\'s included" feature bullets for a gig pricing tier on a Fiverr-style marketplace.',
          '',
          `Tier being drafted: ${tierLabel} (${dollars}, ${days}, ${revs})`,
          '',
          'Other tiers on this gig (you MUST differentiate from these — never duplicate their bullets; the value ladder must add 1–2 NEW concrete benefits at each tier-up step):',
          ladder,
          '',
          tierGuidance,
          '',
          'STANDARD INCLUSIONS — bake these into EVERY tier with tier-appropriate bounds (these are EssayPro-style trust value-adds buyers expect to see; the BOUNDS are what prevent the gig from becoming an open-ended loop):',
          consultant
            ? '  • Originality / AI-content scan ("plagiarism + AI-detection report with delivery"). Always free, one report per order.'
            : '  • Document quality check ("USCIS-style form review for completeness before filing"). Always free, one pass per order.',
          consultant
            ? '  • Format check appropriate to the deliverable (APA / MLA / Chicago / Harvard for academic; ATS-friendly format for resume; LinkedIn-character-cap check for LinkedIn). Always free, one final-format pass per order.'
            : '  • Filing-cover-letter draft included with submission package. Always free, one pass per order.',
          '  • REVISION POLICY — this is the loop guard. Every revision line MUST be bounded by BOTH a count AND a window. Never "unlimited revisions" without a time cap (that\'s the loop hole that creates endless rework). Tier-up adds either MORE rounds, a LONGER window, or both — never the same bound at a higher price.',
          '       Basic: 1 revision round within 7 days of delivery',
          '       Standard: 2 revision rounds within 14 days of delivery',
          '       Premium: 3 revision rounds within 21 days of delivery + 1 follow-up office-hours email if a single concern surfaces post-window',
          '',
          'PREMIUM-ONLY DIFFERENTIATORS — only appear in premium tier bullets (never in basic or standard):',
          '  • Priority turnaround (rush delivery option faster than the listed delivery_days)',
          '  • 1-on-1 strategy / kickoff call (15–30 min, scheduled in advance)',
          '  • Broader scope cap (e.g. longer max word count, more documents, additional school)',
          consultant
            ? '  • Post-delivery touchpoint (one 15-min check-in call within the revision window)'
            : '  • Re-submission / RFE-response support if the initial filing draws a request',
          '',
          'Output rules:',
          '- Return ONLY the bullets, one per line, no hyphens / dashes / numbers / bullet characters — just the text.',
          '- Each line is 4–12 words. Action-led ("Document review with structural feedback"). Concrete deliverable, not a feeling.',
          '- Revision bullets ALWAYS include both count + window ("2 revision rounds within 14 days").',
          '- Plain language. No emoji. No promotional fluff ("amazing", "fast", "premium"). No outcome promises ("guaranteed approval", "100% acceptance").',
          '- Each bullet must be a concrete deliverable a buyer can verify on arrival.',
          '',
          'Context (the broader gig):',
          baseContext,
        ].join('\n'),
      }
    }
    case 'tier_description': {
      const t = ctx.tier ?? {}
      const tierLabel = String(t.tier || t.title || 'this tier')
      const dollars = typeof t.price === 'number' && t.price > 0 ? `$${(t.price / 100).toFixed(2)}` : 'unset'
      const days = typeof t.delivery_days === 'number' && t.delivery_days > 0 ? `${t.delivery_days} days` : 'unset'
      const others = (ctx.otherTiers ?? []).filter((o) => o && (o.title || o.tier))
      const ladder = others.length
        ? others
            .map((o) => {
              const olabel = o.tier || o.title || 'tier'
              const oprice = typeof o.price === 'number' && o.price > 0 ? `$${(o.price / 100).toFixed(2)}` : '—'
              const odesc = (o as { description?: string }).description?.trim() || '(no description yet)'
              return `- ${olabel} @ ${oprice}: ${odesc.slice(0, 200)}`
            })
            .join('\n')
        : '(no other tiers configured)'
      const isBasic = tierLabel.toLowerCase().includes('basic') || tierLabel.toLowerCase().includes('starter')
      const isPremium = tierLabel.toLowerCase().includes('premium') || tierLabel.toLowerCase().includes('pro')

      const tierAngle = isBasic
        ? 'BASIC tier description. Position as "the right starting point for [buyer in specific situation]". Name the ONE core deliverable. Mention that essential trust inclusions (originality report, format check, one revision round within 7 days) come at every tier. Do NOT mention premium-only perks.'
        : isPremium
          ? 'PREMIUM tier description. Lead with WHO this is for ("the right choice when [specific stakes]"). Name the 2–3 premium differentiators that justify the price (priority turnaround, 1-on-1 call, broader scope cap, more revision rounds within a longer window, post-delivery touchpoint). Explicitly contrast: "Adds X, Y, Z over Standard" so the upgrade rationale is clear.'
          : 'STANDARD tier description. Position as "the best-value choice for [the typical buyer]". Name what this tier adds over basic in concrete terms (more revision rounds within a longer window, citation list, optional rush turnaround). Briefly preview that premium adds further perks for higher-stakes situations.'

      return {
        format: 'string', hardLimit: 320,
        prompt: [
          'Write a buyer-facing description for a gig pricing tier on a Fiverr-style marketplace.',
          '',
          `Tier being drafted: ${tierLabel} (${dollars}, ${days})`,
          '',
          'Other tiers on this gig (the value ladder MUST be visible — each tier-up step adds 1-2 concrete benefits over the lower tier):',
          ladder,
          '',
          tierAngle,
          '',
          'LOOP GUARD — when describing what\'s included, never imply unbounded revisions / unlimited rework / endless edits. Revision language must always carry both a count and a time bound (e.g. "2 revision rounds within 14 days of delivery", "Free revisions for 21 days after delivery, up to 3 rounds"). This is what keeps the gig sustainable; it\'s also what a senior practitioner would actually offer.',
          '',
          'FORMAT:',
          '- 2–4 short sentences, 180–300 chars total.',
          '- Sentence 1: who this tier is for (buyer + specific situation).',
          '- Sentence 2: what they get (1–2 concrete deliverables; the rest is in the features list — do NOT enumerate all features).',
          '- Sentence 3 (if used): the BOUND on revisions / scope / turnaround appropriate to this tier.',
          '- Sentence 4 (premium only): the one concrete reason to upgrade from standard.',
          '- Plain language. No emoji. No promotional fluff. No outcome promises.',
          '- Voice: second-person ("you\'ll get") for the buyer-facing parts. Active. Specific. No throat-clearing.',
          '',
          consultant
            ? 'Do not imply legal practice ("attorney review", "legal opinion") — consultant gig.'
            : 'Use precise legal-system anchors (USCIS / Home Office / IRCC + form codes) where the deliverable warrants.',
          '',
          'Return ONLY the description text, no labels, no markdown, no preamble.',
          '',
          'Context (the broader gig):',
          baseContext,
        ].filter(Boolean).join('\n'),
      }
    }
    case 'requirements':
      return {
        format: 'string', hardLimit: 1200,
        prompt: [
          consultant
            ? 'Write a "what we need from the client to begin" requirements list for this professional-services gig.'
            : 'Write a "what we need from the client to begin" requirements list for this legal/immigration gig.',
          '',
          'COHERENCE REQUIREMENT — these must read as a real intake checklist tied directly to THIS specific gig (see the category brief + already-drafted spine above), NOT a generic list of asks:',
          '- Every bullet is something the seller CAN\'T START WITHOUT. If the gig could begin without the item, don\'t list it.',
          '- Every bullet is tied to the specific deliverable. An SOP-editing gig asks for the draft + the school + the word limit + the deadline. A LLC-formation gig asks for the entity name + state + member info + business purpose. Do NOT list generic "any relevant information you want to share" or "background details".',
          '- Group similar items together (documents first, then deadlines/dates, then preferences/decisions).',
          '- Bullets read in the order a seller would actually ask for them in an intake conversation.',
          '',
          'FORMAT: STRICT bullet list. Minimum 4 bullets, maximum 9. EACH bullet on its own line, EACH starting with "- " (hyphen + space) — no other characters at the start of the line, no numbered lists, no asterisks, no Unicode bullets. Blank lines between bullets are fine; anything else gets stripped.',
          'EACH BULLET STRUCTURE:',
          '- Lead with the specific document/data point a seller can verify on arrival ("Your current SOP draft (any length)", "Form I-20 — both sides", "The school name and program code", "Your target submission date").',
          '- Add a brief clarifier in parentheses only when needed for disambiguation ("(front and back)", "(any length)", "(if any)", "(in PDF or Word)").',
          '- Plain language. Active voice (you are asking the buyer for X, not "X will be required"). No emoji. No headings. No closing paragraph. ≤ 100 chars per bullet.',
          '',
          'INTENT-DIVERSITY CHECK — across the 5–9 bullets, cover at minimum:',
          '  • Source material (the buyer\'s draft, current document, existing application materials)',
          '  • Specific identifiers (school name + program, jurisdiction, applicant role, entity name)',
          '  • Deadline / timeline (the buyer\'s submission date or required turnaround)',
          '  • Scope decisions (which schools, which programs, how many rounds, tier choice)',
          '- Optionally a proof item (transcripts, CV, portfolio links) when the gig needs them.',
          '',
          'Do NOT promise outcomes, timelines, eligibility, or refunds.',
          consultant
            ? 'Good bullets for a consultant gig: "- Your current SOP or personal statement draft (any length)", "- The school name(s) and program(s) you\'re applying to", "- The application deadline (or your target submission date)", "- Your CV / résumé or LinkedIn link", "- A short note on what aspects you most want feedback on".'
            : 'Good bullets for an attorney gig: "- Current visa status and date of last entry to the US", "- Form I-20 (front and back) and most recent I-94", "- The specific event(s) that led to the issue we\'re responding to (dates, brief summary)", "- Your target USCIS submission date".',
          '',
          'Return ONLY the bullet list.',
          '',
          'Context:',
          baseContext,
        ].filter(Boolean).join('\n'),
      }
  }
}

// Words that should never end a short surface field (title / pitch /
// seo_title / seo_description). When the hardLimit slice in draftField
// trims a partial word, the new last word can still be a preposition,
// conjunction, or article — which leaves the title reading as a half-
// thought ("...statement of purpose and letter of"). We keep peeling
// back tokens until the last word is a real content word, or we run
// out of characters. Lowercase for case-insensitive matching; the
// comparison normalizes punctuation first.
const DANGLING_END_WORDS = new Set([
  // Prepositions
  'of', 'for', 'to', 'in', 'on', 'at', 'with', 'by', 'from', 'as',
  'into', 'onto', 'over', 'under', 'about', 'against', 'between',
  'through', 'after', 'before', 'during', 'without', 'within',
  // Conjunctions
  'and', 'or', 'but', 'nor', 'so', 'yet', 'because', 'although',
  'though', 'while', 'whereas',
  // Articles + determiners
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her',
  // Misc connective words that also read as dangling
  'that', 'which', 'who', 'whom', 'when', 'where', 'why', 'how',
  'than', 'then', 'plus',
])

// Strips trailing dangling words from a sliced string until the last
// word is a content word OR the string would become too short. Used
// as a belt-and-suspenders guard for surface fields that have a
// hardLimit slice — without this, slicing at the limit can leave the
// output ending mid-thought.
function trimDanglingEnd(s: string, minLength = 30): string {
  let result = s.trim()
  // Strip trailing punctuation first so " of," matches as "of".
  for (let i = 0; i < 8; i += 1) {
    const trimmed = result.replace(/[\s,;:.\-—]+$/g, '')
    if (trimmed.length < minLength) return result
    const lastSpace = trimmed.lastIndexOf(' ')
    if (lastSpace < 0) return trimmed
    const lastWord = trimmed.slice(lastSpace + 1).toLowerCase().replace(/[^a-z']/g, '')
    if (!DANGLING_END_WORDS.has(lastWord)) {
      return trimmed
    }
    result = trimmed.slice(0, lastSpace)
  }
  return result.trim()
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
  // Cap at 10 — matches the intent-diversity FAQ prompt that asks for
  // 8-10 questions across 6 buyer-decision categories. Above 10, the
  // FAQ schema starts feeling exhaustive rather than scannable.
  return entries.slice(0, 10)
}

function buildSystemPrompt(role: SuggestRole): string {
  const consultant = role === 'consultant'
  return [
    consultant
      ? 'You are a senior SEO copywriter for a professional-services marketplace (similar to Fiverr) covering academic, career, business, settlement, and mentorship consulting. You write for verified consultants, not licensed legal practitioners.'
      : 'You are a senior SEO copywriter for a legal-services marketplace (similar to Fiverr).',
    'WRITING IDENTITY: You write like a practitioner with 10+ years in the niche, not a generic AI. Concrete nouns, specific numbers, named entities (real schools, real document names, real form codes, real programs). Active voice. Varied sentence rhythm. Contractions where natural. Second-person bias when addressing the buyer. You read as a person, not a thesaurus parade.',
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
  '1. Primary keyword = the first entry in the priority list above. Use it verbatim where it fits; use a close variant elsewhere. Place it in the first 60 characters of any prose field. LENGTH RULE: if the primary keyword is 5+ words long (typical of strategic-source quarterly targets like "STEM OPT employer monitoring site visit 2026"), DO NOT cram the whole phrase verbatim into a title or pitch — extract the 1-3 most salient terms (e.g. "STEM OPT", "duration of status", "study permit cap") and weave the full phrase into the long description or an FAQ entry where there is room. Short multi-word category keywords (e.g. "personal statement", "study permit") get the verbatim treatment in titles; long-tail strategic phrases do not.',
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
  // Voice + craft layer: HOW the model writes. Four blocks injected
  // between the SEO research (what keywords) and the field task (what
  // shape). Order is intentional:
  //   - SEO_PLAYBOOK: keyword discipline (placement, density, intent)
  //   - VOICE_PLAYBOOK: sentence rhythm, active voice, show-don't-tell
  //   - KEYWORD_WEAVING_PLAYBOOK: senior-SEO-engineer integration rules
  //   - BANNED_AI_TELLS: hard exclude list of the obvious AI defaults
  //   - FIELD_TONE_SCAFFOLD: per-field register + worked example
  // Each layer constrains a different axis; together they give the
  // model the same scaffolding a senior practitioner would apply.
  const fieldToneScaffold = getFieldToneScaffold(field as FieldName, role)
  const userMessage = [
    researchBlock,
    '',
    SEO_PLAYBOOK,
    '',
    VOICE_PLAYBOOK,
    '',
    KEYWORD_WEAVING_PLAYBOOK,
    '',
    getBannedAiTellsBlock(),
    '',
    fieldToneScaffold,
    '',
    `## Style cue for this draft\nFor this specific draft, ${styleCue}.`,
    '',
    '## Task',
    spec.prompt,
    trimmedHint ? `\nAdditional guidance from the seller: ${trimmedHint}` : '',
    previousBlock,
  ].filter(Boolean).join('\n')

  // Per-field output budget. Default (600 tokens, ~450 words) covers
  // titles, pitches, SEO meta, tier features, tier descriptions,
  // requirements, and tags — every field that targets short or list
  // output. FAQ asks for 8-10 Q+A pairs with 2-4 sentence answers
  // where the first sentence is 40-60 words; that's 800-1500 tokens
  // of output. Long-form description targets 500-700 words ≈ 650-900
  // tokens. Both hit the prior 600-token ceiling and got chopped off
  // mid-output — which is why "Draft FAQ" sometimes shipped only 1
  // question instead of the requested 8-10.
  const FIELD_OUTPUT_BUDGET: Record<SuggestField, number> = {
    title: 600,
    seo_title: 600,
    seo_description: 600,
    pitch: 600,
    tagline: 600,
    description: 2000,
    tags: 600,
    requirements: 800,
    faq: 2200,
    tier_features: 600,
    tier_description: 600,
  }
  const maxOutputTokens = FIELD_OUTPUT_BUDGET[field] ?? 600

  let raw: string
  try {
    raw = await provider.reply(
      buildSystemPrompt(role),
      [{ role: 'user', content: userMessage }],
      { maxOutputTokens },
    )
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
  // Surface-field truncation pipeline:
  //   1. If over hardLimit, slice at the limit and drop the partial word
  //      (the existing behavior).
  //   2. THEN trim any trailing dangling word (preposition, conjunction,
  //      article, determiner) so the field doesn't read as a half-thought
  //      like "...statement of purpose and letter of". This is the fix
  //      for the title-cuts-mid-sentence bug. Only applied to short
  //      surface fields where the hardLimit is small enough that
  //      dangling-ends are a real problem (title 78, seo_title 60,
  //      seo_description 160, pitch 160).
  let limited = spec.hardLimit && cleaned.length > spec.hardLimit
    ? cleaned.slice(0, spec.hardLimit).replace(/\s+\S*$/, '')
    : cleaned
  if (spec.hardLimit && spec.hardLimit <= 200 && field !== 'description') {
    // minLength = ~40% of hardLimit so we don't over-trim a short
    // title down to nothing if the model wrote nothing but dangling
    // words. Below that floor we accept the dangling end rather than
    // ship an absurdly short field.
    const floor = Math.max(20, Math.floor(spec.hardLimit * 0.4))
    limited = trimDanglingEnd(limited, floor)
  }
  return { ok: true, value: limited, research }
}
