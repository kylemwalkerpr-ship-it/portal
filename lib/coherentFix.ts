// Shared "coherent fix" helper. Used by:
//   /api/seo/coherent-fix         — one-click SEO checklist row fix
//   /api/compliance/coherent-fix  — one-click compliance row draft
//
// The premise is the same in both surfaces: load the WHOLE document the
// user is editing (gig or profile/application), call the AI chain via
// getChatProvider(), and ask it to modify ONLY the named field while
// keeping every other field byte-identical. The route layer is thin —
// it loads the data, calls into this helper, then unwraps strict JSON.
//
// We do NOT modify chatProvider.ts; we just call its existing reply().

import { getChatProvider } from './chatProvider'
import { BANNED_AI_TELLS } from './seoVoice'

export interface FieldChange {
  field: string
  before: string
  after: string
  rationale: string
}

export interface CoherentFixSeoArgs {
  // Whole-gig snapshot the model anchors against — every field is
  // shown so the model knows what NOT to change. Only `targetFields`
  // are editable.
  gig: {
    id: string
    title: string | null
    seo_title: string | null
    seo_description: string | null
    pitch: string | null
    description: string | null
    tags: string[] | null
    category: string | null
    subcategory: string | null
    jurisdiction: string | null
    faq: Array<{ question?: string; answer?: string }> | null
    tiers: Array<{ tier?: string | null; price?: number | null; delivery_days?: number | null; features?: string[] | null }> | null
  }
  seller: {
    years_experience: number | null
    credential: string | null
    completed_orders: number | null
    response_hours: number | null
    offers_free_consult: boolean | null
  } | null
  role: 'attorney' | 'consultant'
  // The checklist row the user clicked.
  issueId: string
  issueLabel: string
  issueHint: string
  // Which fields the model is allowed to touch. Everything else must
  // stay byte-identical.
  targetFields: SeoEditableField[]
  // Optional regeneration nonce — when callers re-roll, bump this so
  // even at temperature 0.4 the response varies.
  seed?: number
  // Optional directed-intent guidance for the rewrite. Used by the
  // route layer to feed the audit's `intentBucketHints` (missing
  // buckets + concrete example phrases) into the prompt so the AI
  // doesn't just receive a generic "broaden intent" hint.
  intentBucketHints?: Array<{ bucket: string; phrases: string[] }>
  // Optional missing keyword the seller asked us to weave in. Used by
  // the cluster-coverage "MISSING — add this keyword" flow so the AI
  // knows the EXACT phrase + intent bucket to insert.
  targetedKeyword?: {
    term: string
    intent?: string
  } | null
}

export type SeoEditableField =
  | 'title' | 'seo_title' | 'seo_description'
  | 'pitch' | 'description' | 'tags' | 'faq'

const SEO_FIELD_LIMITS: Record<SeoEditableField, string> = {
  title:           '55–75 chars, ends on a noun phrase, no markdown.',
  seo_title:       '50–60 chars, primary keyword in first 30 chars, no preamble.',
  seo_description: '140–155 chars, primary keyword in first 60 chars, ends with a soft CTA.',
  pitch:           '60–150 chars, one sentence, names the audience + outcome.',
  description:     '500–700 words, plain prose, no markdown headings or bullets.',
  tags:            'Comma-separated. Up to 5 lowercase tags, 1–3 words each.',
  faq:             '6–12 Q/A pairs. Each answer ≥ 80 chars, plain prose.',
}

function gigSnapshot(gig: CoherentFixSeoArgs['gig']): string {
  const tags = Array.isArray(gig.tags) ? gig.tags.join(', ') : ''
  const faqPreview = Array.isArray(gig.faq) && gig.faq.length > 0
    ? gig.faq.slice(0, 3).map((f, i) => `  ${i + 1}. Q: ${f?.question ?? ''}\n     A: ${f?.answer ?? ''}`).join('\n')
    : '  (none)'
  const tiersPreview = Array.isArray(gig.tiers) && gig.tiers.length > 0
    ? gig.tiers.map(t => `  ${t.tier ?? ''} @ ${t.price ? `$${(t.price / 100).toFixed(0)}` : '—'} · ${t.delivery_days ?? '—'}d`).join('\n')
    : '  (none)'
  return [
    `- title: ${gig.title ?? ''}`,
    `- seo_title: ${gig.seo_title ?? ''}`,
    `- seo_description: ${gig.seo_description ?? ''}`,
    `- pitch: ${gig.pitch ?? ''}`,
    `- tags: ${tags}`,
    `- category: ${gig.category ?? ''} / subcategory: ${gig.subcategory ?? ''}`,
    `- jurisdiction: ${gig.jurisdiction ?? ''}`,
    `- description (truncated to 1500 chars):\n${(gig.description ?? '').slice(0, 1500)}`,
    `- FAQ preview (first 3):\n${faqPreview}`,
    `- pricing tiers:\n${tiersPreview}`,
  ].join('\n')
}

function sellerLines(seller: CoherentFixSeoArgs['seller']): string {
  if (!seller) return '(no seller credibility data available)'
  const lines: string[] = []
  if (seller.years_experience) lines.push(`- ${seller.years_experience} years of experience`)
  if (seller.credential) lines.push(`- Credential: ${seller.credential}`)
  if (seller.completed_orders) lines.push(`- ${seller.completed_orders} completed orders`)
  if (seller.response_hours) lines.push(`- Typical response within ${seller.response_hours} hours`)
  if (seller.offers_free_consult) lines.push('- Offers free consultation')
  return lines.length > 0 ? lines.join('\n') : '(seller has not filled in credibility fields)'
}

function buildSeoSystemPrompt(role: 'attorney' | 'consultant'): string {
  return [
    'You are editing a published gig on a Fiverr-style services marketplace. The seller clicked ONE checklist row to fix.',
    role === 'consultant'
      ? 'The seller is a non-legal consultant — never use legal-system anchors (USCIS, Home Office, IRCC) or imply legal practice.'
      : 'The seller is a licensed attorney — use precise jurisdiction anchors (USCIS, Home Office, IRCC) where the deliverable warrants.',
    'YOUR ABSOLUTE CONSTRAINT: modify ONLY the field(s) the user names as editable. Every other field stays BYTE-IDENTICAL.',
    'You may not introduce a different buyer, price, jurisdiction, deliverable, or voice than what already exists in the snapshot.',
    'You may not fabricate credentials, dates, case outcomes, or numerical proof points.',
    'Your edited field must respect the field length / structural limit named in the brief.',
    'You return STRICT JSON ONLY — no markdown, no preamble, no commentary outside the JSON envelope.',
  ].join(' ')
}

function buildSeoUserPrompt(args: CoherentFixSeoArgs): string {
  const fields = args.targetFields
  const limits = fields.map(f => `- ${f}: ${SEO_FIELD_LIMITS[f]}`).join('\n')
  // Directed-intent block — when present, the AI gets the missing
  // buckets and example phrases for each so the rewrite measurably
  // increases the audit's intent.covered count (target: +1-3 buckets).
  const intentBlock = args.intentBucketHints && args.intentBucketHints.length > 0
    ? [
        '## Intent buckets the audit says are MISSING — fill at least 2 of these',
        ...args.intentBucketHints.map((h) => {
          const samples = h.phrases.map((p) => `"${p}"`).join(', ')
          return `- ${h.bucket}: weave phrasing similar to ${samples}.`
        }),
        '',
        'Concrete patterns by bucket:',
        '- long_tail: write a step-by-step paragraph or numbered list using a 5+ word user query.',
        '- comparison: add a short "how I differ from..." paragraph using comparison phrasing.',
        '- trust: insert credibility cues — years of experience, completed orders, response window.',
        '- informational: explain a process or definition the buyer searches before buying.',
        '- transactional: include a clear hire/book/order verb tied to the deliverable.',
        '- study_abroad: name the visa/program/school program when appropriate.',
        '- cross_appeal: bridge two related needs (e.g. essay + visa, career + mentor).',
        'After your rewrite, the audit\'s intent.covered count MUST increase by at least 1, ideally 2-3.',
        '',
      ].join('\n')
    : ''
  const targetedKwBlock = args.targetedKeyword
    ? [
        '## Targeted keyword to weave in (THE specific phrase, not a synonym)',
        `- term: "${args.targetedKeyword.term}"`,
        args.targetedKeyword.intent ? `- intent bucket it fills: ${args.targetedKeyword.intent}` : '',
        'Weave it into description and tags (or title when relevant). Don\'t pad — REPLACE a weaker phrase if needed so word counts stay close to the original.',
        '',
      ].filter(Boolean).join('\n')
    : ''
  return [
    '## Current gig state (DO NOT change any field that is not in the editable list)',
    gigSnapshot(args.gig),
    '',
    '## Seller credibility (for E-E-A-T context — never invent values beyond these)',
    sellerLines(args.seller),
    '',
    '## Issue the seller clicked',
    `- id: ${args.issueId}`,
    `- label: ${args.issueLabel}`,
    `- hint: ${args.issueHint}`,
    '',
    targetedKwBlock,
    intentBlock,
    '## Fields you MAY edit (and their limits)',
    limits,
    '',
    '## Banned phrases (do NOT use any of these — they mark copy as AI-generated)',
    BANNED_AI_TELLS.slice(0, 60).map(p => `"${p}"`).join(', '),
    '',
    '## Output format',
    'Return STRICT JSON with this exact shape (no markdown, no code fence, no commentary):',
    '{',
    '  "changes": [',
    '    { "field": "<fieldName>", "after": "<edited value as string OR array of strings for tags OR array of {question,answer} for faq>", "rationale": "<one sentence>" }',
    '  ]',
    '}',
    `Include one entry per field in the editable list (${fields.join(', ')}). If a field needs no change for this issue, omit it.`,
    args.seed ? `Variation seed: ${args.seed}` : '',
  ].filter(Boolean).join('\n')
}

// Strip code fences / preamble the model sometimes adds around the JSON,
// then JSON.parse. Returns null on parse failure.
function parseJsonish(raw: string): unknown {
  let s = raw.trim()
  // Strip ```json ... ``` fence
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  // Some models prefix with "Here is the JSON:" — drop up to the first {
  const firstBrace = s.indexOf('{')
  if (firstBrace > 0) s = s.slice(firstBrace)
  const lastBrace = s.lastIndexOf('}')
  if (lastBrace >= 0 && lastBrace < s.length - 1) s = s.slice(0, lastBrace + 1)
  try { return JSON.parse(s) } catch { return null }
}

export interface CoherentFixSeoResult {
  ok: true
  changes: Array<{
    field: SeoEditableField
    before: string
    after: string | string[] | Array<{ question: string; answer: string }>
    rationale: string
  }>
}
// Helper: expose the raw parsed changes for downstream score
// projection. The route layer feeds these into projectAuditAfterPatch
// to compute expectedScoreDelta before returning.
export function changesToPatch(
  changes: CoherentFixSeoResult['changes'],
): Partial<{
  title: string; seo_title: string; seo_description: string;
  pitch: string; description: string;
  tags: string[]; faq: Array<{ question: string; answer: string }>
}> {
  const out: Record<string, unknown> = {}
  for (const c of changes) {
    if (c.field === 'tags') {
      out.tags = Array.isArray(c.after) ? (c.after as string[]) : []
    } else if (c.field === 'faq') {
      out.faq = Array.isArray(c.after) ? (c.after as Array<{ question: string; answer: string }>) : []
    } else if (typeof c.after === 'string') {
      out[c.field] = c.after
    }
  }
  return out as ReturnType<typeof changesToPatch>
}
export interface CoherentFixFailure {
  ok: false
  status: number
  message: string
}

function beforeForField(gig: CoherentFixSeoArgs['gig'], field: SeoEditableField): string {
  switch (field) {
    case 'title':           return gig.title ?? ''
    case 'seo_title':       return gig.seo_title ?? ''
    case 'seo_description': return gig.seo_description ?? ''
    case 'pitch':           return gig.pitch ?? ''
    case 'description':     return gig.description ?? ''
    case 'tags':            return Array.isArray(gig.tags) ? gig.tags.join(', ') : ''
    case 'faq': {
      const faq = Array.isArray(gig.faq) ? gig.faq : []
      return faq.map((f, i) => `${i + 1}. Q: ${f?.question ?? ''}\n   A: ${f?.answer ?? ''}`).join('\n\n')
    }
  }
}

export async function runSeoCoherentFix(
  args: CoherentFixSeoArgs,
): Promise<CoherentFixSeoResult | CoherentFixFailure> {
  const provider = getChatProvider()
  if (!provider) {
    return { ok: false, status: 503, message: 'AI assistant is not configured. Add GROQ_API_KEY, GEMINI_API_KEY, or Cloudflare AI creds.' }
  }
  const system = buildSeoSystemPrompt(args.role)
  const user = buildSeoUserPrompt(args)
  let raw: string
  try {
    raw = await provider.reply(system, [{ role: 'user', content: user }], { maxOutputTokens: 2400 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, message: `AI coherent-fix failed: ${msg}` }
  }
  const parsed = parseJsonish(raw)
  if (!parsed || typeof parsed !== 'object' || !('changes' in parsed)) {
    return { ok: false, status: 502, message: 'Model returned malformed JSON. Try Re-roll or edit manually.' }
  }
  const rawChanges = (parsed as { changes: unknown }).changes
  if (!Array.isArray(rawChanges)) {
    return { ok: false, status: 502, message: 'Model response missing "changes" array.' }
  }
  const allowed = new Set<SeoEditableField>(args.targetFields)
  const changes: CoherentFixSeoResult['changes'] = []
  for (const c of rawChanges) {
    if (!c || typeof c !== 'object') continue
    const field = (c as { field?: unknown }).field
    const after = (c as { after?: unknown }).after
    const rationale = (c as { rationale?: unknown }).rationale
    if (typeof field !== 'string' || !allowed.has(field as SeoEditableField)) continue
    const f = field as SeoEditableField
    // Normalize per-field shape.
    let afterValue: string | string[] | Array<{ question: string; answer: string }> | null = null
    if (f === 'tags') {
      if (Array.isArray(after)) afterValue = after.filter((t): t is string => typeof t === 'string').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5)
      else if (typeof after === 'string') afterValue = after.split(/[,\n]+/g).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 5)
    } else if (f === 'faq') {
      if (Array.isArray(after)) {
        afterValue = (after as unknown[])
          .map((e) => {
            if (!e || typeof e !== 'object') return null
            const q = (e as { question?: unknown }).question
            const a = (e as { answer?: unknown }).answer
            if (typeof q === 'string' && typeof a === 'string' && q.trim() && a.trim()) {
              return { question: q.trim().slice(0, 200), answer: a.trim().slice(0, 600) }
            }
            return null
          })
          .filter((e): e is { question: string; answer: string } => !!e)
          .slice(0, 12)
      }
    } else {
      if (typeof after === 'string') afterValue = after.trim()
    }
    if (afterValue === null) continue
    changes.push({
      field: f,
      before: beforeForField(args.gig, f),
      after: afterValue,
      rationale: typeof rationale === 'string' ? rationale.slice(0, 280) : '',
    })
  }
  if (changes.length === 0) {
    return { ok: false, status: 502, message: 'Model returned no usable changes. Try Re-roll or edit manually.' }
  }
  return { ok: true, changes }
}

// ---------------------------------------------------------------------
// Compliance side — much simpler. We draft ONE field (a paragraph the
// seller will paste into the appropriate intake/profile field) given
// the role + credential type + jurisdictions. No diff, no commit —
// the user is expected to copy/edit before submitting upstream.

export interface CoherentFixComplianceArgs {
  role: 'attorney' | 'consultant'
  issueId: string
  issueLabel: string
  profileContext: {
    full_name: string | null
    credential_type: string | null
    jurisdictions: string | null
    years_experience: number | null
  }
  seed?: number
}

export interface CoherentFixComplianceResult {
  ok: true
  draft: string
  rationale: string
  nextAction: { label: string; endpoint?: string; bodyKey?: string }
}

const COMPLIANCE_BRIEFS: Record<string, { editable: boolean; label: string; brief: string }> = {
  email: {
    editable: false,
    label: 'Resend verification email',
    brief: 'Email verification is automated; explain what to do if the verification email never arrived (check spam, request resend from /dashboard). Do NOT draft a placeholder email body — the seller does not author the verification email.',
  },
  phone: {
    editable: false,
    label: 'Verify phone',
    brief: 'Phone verification runs via SMS OTP. Explain the flow and that the seller enters their own number; do NOT draft a phone number.',
  },
  two_factor: {
    editable: false,
    label: 'Set up 2FA',
    brief: '2FA setup is mechanical (scan QR + 6-digit code). Explain the security rationale; do NOT draft a secret.',
  },
  application: {
    editable: false,
    label: 'Start application',
    brief: 'Application status is read-only until the seller submits one. Point them to /dashboard/{role}/intake.',
  },
  credential_type: {
    editable: true,
    label: 'Draft credential summary',
    brief: 'Write a 2–3 sentence credential summary the seller can paste into their application credential field. It must say WHICH credential body they hold (e.g. State Bar of California for an attorney, ICCRC R-number for a Canadian consultant, OISC for a UK consultant) — but only NAME the body, NEVER invent a number, year, or membership status. The seller fills in the real identifier. End with the line: "Replace [bracketed placeholders] with your real values before submitting."',
  },
  bar_number: {
    editable: true,
    label: 'Draft a placeholder + how-to find it',
    brief: 'Draft a 2–3 sentence note explaining WHERE the seller looks up their bar / membership number for their jurisdiction (e.g. State Bar of California search portal, Law Society of England and Wales roll, ICCRC member directory). Use the literal placeholder "[YOUR NUMBER]" — do NOT generate a real-looking number. End with: "Paste your real number into the bar_number field on your application."',
  },
  malpractice: {
    editable: true,
    label: 'Draft a malpractice disclosure paragraph',
    brief: 'Draft a 3–4 sentence disclosure template the seller will paste into the malpractice_insurance application field. Include placeholders "[CARRIER]", "[POLICY NUMBER]", "[COVERAGE LIMIT]", "[EFFECTIVE DATE]" — do NOT invent any of these. Mention that the disclosure is for internal verification and not shown to buyers. End with: "Replace [bracketed placeholders] with the values from your declarations page before submitting."',
  },
  jurisdictions: {
    editable: true,
    label: 'Draft a jurisdictions list',
    brief: 'Suggest 1–3 jurisdictions the seller LIKELY serves given their role and credential type, framed as a question — never as an assertion. Format: "Do any of these match the bars / regulatory bodies you actually hold? [list]". Include a one-line risk callout (e.g. "Listing a jurisdiction you are NOT admitted to is unauthorized practice of law and grounds for removal."). Do NOT auto-fill a jurisdiction; the seller must confirm.',
  },
  payout: {
    editable: false,
    label: 'Payout setup',
    brief: 'Manual payouts via admin today. Do not draft anything — just explain.',
  },
  accepting: {
    editable: false,
    label: 'Toggle availability',
    brief: 'A simple visibility toggle. Do not draft anything.',
  },
}

function buildComplianceSystemPrompt(role: 'attorney' | 'consultant'): string {
  return [
    `You are a compliance writing assistant for a ${role === 'attorney' ? 'legal-services' : 'professional-services'} marketplace.`,
    'You DRAFT placeholder text the seller will edit. You NEVER generate real identifiers (bar numbers, policy numbers, dates, carrier names). When a real value is needed, use a clearly-bracketed placeholder like "[CARRIER]" or "[YOUR NUMBER]".',
    'You never claim a seller is admitted to a bar, holds insurance, or has any specific credential — only the seller can make that factual claim.',
    'Your tone is precise, plain-language, and ready-to-paste. No emoji. No markdown. 2–4 sentences total unless the brief asks for a list.',
    'You return STRICT JSON ONLY — no preamble, no markdown fence.',
  ].join(' ')
}

export async function runComplianceCoherentFix(
  args: CoherentFixComplianceArgs,
): Promise<CoherentFixComplianceResult | CoherentFixFailure> {
  const brief = COMPLIANCE_BRIEFS[args.issueId]
  if (!brief) {
    return { ok: false, status: 400, message: `Unknown compliance item "${args.issueId}".` }
  }
  if (!brief.editable) {
    // For non-AI items, return a deterministic message so the UI can
    // show a non-AI explanation without spending a model call.
    return {
      ok: true,
      draft: '',
      rationale: brief.brief,
      nextAction: { label: brief.label },
    }
  }
  const provider = getChatProvider()
  if (!provider) {
    return { ok: false, status: 503, message: 'AI assistant is not configured.' }
  }
  const ctx = args.profileContext
  const system = buildComplianceSystemPrompt(args.role)
  const user = [
    `## Task`,
    brief.brief,
    '',
    `## Seller context (for tone — do NOT add new factual claims beyond these)`,
    `- Role: ${args.role}`,
    `- Full name: ${ctx.full_name ?? '(unspecified)'}`,
    `- Credential type on file: ${ctx.credential_type ?? '(unspecified)'}`,
    `- Jurisdictions on file: ${ctx.jurisdictions ?? '(unspecified)'}`,
    `- Years of experience: ${ctx.years_experience ?? '(unspecified)'}`,
    '',
    '## Output format',
    'Return STRICT JSON ONLY with this exact shape (no markdown, no code fence):',
    '{',
    '  "draft": "<the ready-to-paste text with placeholders in [BRACKETS]>",',
    '  "rationale": "<one sentence explaining what this draft is and why it matters>"',
    '}',
    args.seed ? `Variation seed: ${args.seed}` : '',
  ].filter(Boolean).join('\n')
  let raw: string
  try {
    raw = await provider.reply(system, [{ role: 'user', content: user }], { maxOutputTokens: 800 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, message: `AI compliance draft failed: ${msg}` }
  }
  const parsed = parseJsonish(raw)
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, status: 502, message: 'Model returned malformed JSON. Try Re-roll.' }
  }
  const draft = typeof (parsed as { draft?: unknown }).draft === 'string'
    ? ((parsed as { draft: string }).draft).trim()
    : ''
  const rationale = typeof (parsed as { rationale?: unknown }).rationale === 'string'
    ? ((parsed as { rationale: string }).rationale).trim().slice(0, 280)
    : ''
  if (!draft) {
    return { ok: false, status: 502, message: 'Model returned an empty draft. Try Re-roll.' }
  }
  return {
    ok: true,
    draft,
    rationale,
    nextAction: { label: brief.label },
  }
}

export function isComplianceItemAiEditable(issueId: string): boolean {
  return !!COMPLIANCE_BRIEFS[issueId]?.editable
}
