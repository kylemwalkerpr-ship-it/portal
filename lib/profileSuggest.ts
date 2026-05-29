// AI draft pipeline for user profile fields. Parallel to lib/seoSuggest.ts
// (which handles gig fields), but tuned for the seller-card prose that
// shows on /providers/<handle> — tagline, intro, bio, specialties tags,
// practice areas, video intro scripts.
//
// Safety contract (mirrors lib/api/compliance/guide):
//   - NEVER fabricate bar numbers, registration numbers, license IDs,
//     malpractice policy numbers, case outcomes, or specific years that
//     weren't supplied in the context.
//   - NEVER invent jurisdictions the user isn't actually admitted in.
//   - NEVER promise outcomes ("guaranteed approval", "100% win rate").
//   - Always write from the seller's own perspective (first person);
//     no "as an AI" disclaimers.

import { getChatProvider } from './chatProvider'

export type ProfileField =
  | 'tagline'
  | 'intro'
  | 'bio'
  | 'specialties'
  | 'practice_areas'
  | 'subjects'
  | 'industries'
  | 'languages'

export const ALLOWED_PROFILE_FIELDS: ProfileField[] = [
  'tagline', 'intro', 'bio', 'specialties', 'practice_areas', 'subjects', 'industries', 'languages',
]

// Per-role allow-lists. The shared fields are common; the role-divergent
// fields (attorney: practice_areas; consultant: subjects/industries) must NOT
// be draftable cross-role — an attorney requesting `subjects` (a column its
// table lacks) would otherwise get a prompt grounded on nothing, for a field
// its editor/PATCH can't even save.
const SHARED_PROFILE_FIELDS: ProfileField[] = ['tagline', 'intro', 'bio', 'specialties', 'languages']
export const ATTORNEY_PROFILE_FIELDS: ProfileField[] = [...SHARED_PROFILE_FIELDS, 'practice_areas']
export const CONSULTANT_PROFILE_FIELDS: ProfileField[] = [...SHARED_PROFILE_FIELDS, 'subjects', 'industries']

export function allowedFieldsForRole(role: 'attorney' | 'consultant'): ProfileField[] {
  return role === 'attorney' ? ATTORNEY_PROFILE_FIELDS : CONSULTANT_PROFILE_FIELDS
}

export type ProfileRole = 'attorney' | 'consultant'

export interface ProfileContext {
  role: ProfileRole
  full_name?: string | null
  credential_type?: string | null
  years_experience?: number | null
  subjects?: string | null
  industries?: string | null
  jurisdictions?: string | null
  practice_areas?: string | null
  specialties?: string[] | null
  languages?: string[] | null
  education?: string | null
  tagline?: string | null
  intro?: string | null
  bio?: string | null
  // Regeneration support: when the caller wants a new draft (not the same
  // text again), it sends the previous output so the prompt can instruct
  // the model to produce a distinct alternative.
  previousValue?: string | null
}

export type ProfileSuggestSuccess = {
  ok: true
  value: string | string[]
}
export type ProfileSuggestFailure = {
  ok: false
  status: number
  message: string
}
export type ProfileSuggestResult = ProfileSuggestSuccess | ProfileSuggestFailure

interface ProfileFieldSpec {
  prompt: string
  format: 'string' | 'list'
  hardLimit?: number
}

function buildBaseContext(ctx: ProfileContext): string {
  const lines: string[] = []
  lines.push(`Role: ${ctx.role === 'attorney' ? 'Licensed attorney' : 'Non-legal consultant — academic, career, business, education, settlement'}`)
  if (ctx.full_name) lines.push(`Display name: ${ctx.full_name}`)
  if (ctx.credential_type) lines.push(`Credential: ${ctx.credential_type}`)
  if (typeof ctx.years_experience === 'number' && ctx.years_experience > 0) {
    lines.push(`Years of experience: ${ctx.years_experience}`)
  }
  if (ctx.role === 'attorney') {
    if (ctx.jurisdictions) lines.push(`Jurisdictions admitted: ${ctx.jurisdictions}`)
    if (ctx.practice_areas) lines.push(`Practice areas: ${ctx.practice_areas}`)
  } else {
    if (ctx.subjects) lines.push(`Subjects: ${ctx.subjects}`)
    if (ctx.industries) lines.push(`Industries: ${ctx.industries}`)
  }
  if (ctx.specialties && ctx.specialties.length) lines.push(`Specialties: ${ctx.specialties.join(', ')}`)
  if (ctx.languages && ctx.languages.length) lines.push(`Languages: ${ctx.languages.join(', ')}`)
  if (ctx.education) lines.push(`Education: ${ctx.education}`)
  if (ctx.tagline) lines.push(`Existing tagline: ${ctx.tagline}`)
  if (ctx.intro) lines.push(`Existing intro: ${ctx.intro.slice(0, 400)}`)
  if (ctx.bio) lines.push(`Existing bio: ${ctx.bio.slice(0, 800)}`)
  return lines.join('\n')
}

function buildFieldSpec(field: ProfileField, ctx: ProfileContext): ProfileFieldSpec {
  const base = buildBaseContext(ctx)
  const roleLabel = ctx.role === 'attorney' ? 'attorney' : 'consultant'
  switch (field) {
    case 'tagline':
      return {
        format: 'string', hardLimit: 160,
        prompt: [
          `Write a single-line tagline for a ${roleLabel}'s public marketplace profile.`,
          'Requirements:',
          '- 60–120 characters. One sharp line that fits on a search-results card.',
          '- Lead with the buyer-facing outcome or specialty (e.g. "MBA admissions strategist" or "Career-pivot coach for mid-level professionals"), not a generic title.',
          '- If the context lists years of experience, subjects, or industries, you MAY mention them — do not invent any.',
          '- Use first person ONLY if the seller already does in their existing tagline / intro; otherwise stay neutral.',
          '- No emoji, no quotation marks, no hashtags, no outcome guarantees, no specific case-count claims unless they appear in the context.',
          'Return ONLY the tagline text, single line.',
          '',
          'Context:',
          base,
        ].join('\n'),
      }
    case 'intro':
      return {
        format: 'string', hardLimit: 600,
        prompt: [
          `Write a 2–3 sentence intro / byline for a ${roleLabel}'s public profile.`,
          'Requirements:',
          '- Establishes credibility and warmth in the first sentence.',
          '- Names the typical client and the outcome the seller delivers.',
          '- May reference the seller\'s years of experience, subjects, or industries from the context — DO NOT invent any.',
          '- First person ("I help…", "I guide…") is fine and preferred when no contrary signal exists.',
          '- No outcome promises ("guaranteed", "100%"), no specific case counts unless they appear in the context.',
          '- No emoji, no quotation marks, no markdown.',
          'Return ONLY the intro prose.',
          '',
          'Context:',
          base,
        ].join('\n'),
      }
    case 'bio': {
      const isAttorney = ctx.role === 'attorney'
      return {
        format: 'string', hardLimit: 4000,
        prompt: [
          `Write a long-form bio (300–500 words) for a ${roleLabel}'s public profile.`,
          'Structure: 3 paragraphs, plain prose, no markdown headings or bullets.',
          isAttorney
            ? '1) Opening paragraph: who they are and what kind of cases they take. Lead with the buyer-facing outcome.'
            : '1) Opening paragraph: who they are and what kind of work they do. Lead with the buyer-facing outcome.',
          '2) Middle paragraph: how they work — process, communication style, what to expect from an engagement.',
          isAttorney
            ? '3) Closing paragraph: who they serve best, and (optionally) cases they\'re NOT the right fit for. Honest scoping helps qualified-lead quality.'
            : '3) Closing paragraph: who they serve best, and (optionally) projects they\'re NOT the right fit for. Honest scoping helps qualified-lead quality.',
          'SEO discipline:',
          isAttorney
            ? '- Include the seller\'s practice area keywords from the context naturally in paragraph 1.'
            : '- Include the seller\'s subject and industry keywords from the context naturally in paragraph 1.',
          isAttorney ? '- If the context lists jurisdictions, name at least one in paragraph 1.' : '',
          'Hard limits:',
          '- NEVER invent bar numbers, registration IDs, license numbers, malpractice insurance details, or specific case counts.',
          '- NEVER claim or imply guaranteed outcomes.',
          isAttorney ? '- NEVER list jurisdictions the context doesn\'t mention.' : '',
          '- First person preferred; no AI-assistant disclaimers.',
          'Return ONLY the bio prose.',
          '',
          'Context:',
          base,
        ].filter(Boolean).join('\n'),
      }
    }
    case 'specialties':
      return {
        format: 'list', hardLimit: 8,
        prompt: [
          `Suggest 5–8 specialty tags for a ${roleLabel}'s public profile.`,
          'Tags are more granular than practice areas — they\'re the specific things this seller is best at.',
          'Format: each tag is 1–4 words, sentence-case or title-case (consistent across the set), no emoji, no punctuation other than spaces and hyphens.',
          'Source discipline:',
          '- Pull specialty ideas from the seller\'s subjects, industries, and existing prose in the context.',
          '- Do not invent specialties the context doesn\'t support. If subjects are "MBA admissions, STEM SOPs", reasonable tags include "MBA admissions", "STEM SOPs", "Scholarship essays" — but not "Family law" or "Criminal defense".',
          'Return ONLY the tags, comma-separated on a single line.',
          '',
          'Context:',
          base,
        ].join('\n'),
      }
    case 'practice_areas':
      return {
        format: 'string', hardLimit: 240,
        prompt: [
          `Suggest the top-level practice areas for this ${roleLabel}.`,
          'Format: 2–5 broad practice areas, comma-separated on a single line.',
          'These should be the umbrella categories a buyer would scan a directory by (e.g. "Immigration, Family, Housing"). Each entry is 1–3 words, title case.',
          'Source discipline:',
          '- Only suggest practice areas the context supports. If the seller has US immigration jurisdictions and no other signals, suggest "Immigration" — not "Tax" or "IP".',
          '- Do not list a jurisdiction (e.g. "California") as a practice area; jurisdictions belong in the jurisdictions field.',
          'Return ONLY the comma-separated list.',
          '',
          'Context:',
          base,
        ].join('\n'),
      }
    case 'subjects':
      return {
        format: 'string', hardLimit: 240,
        prompt: [
          `Suggest the subjects / topics this ${roleLabel} teaches or advises on.`,
          'Format: 2–5 subjects, comma-separated on a single line.',
          'These should be the topics a buyer would search by (e.g. "MBA admissions, STEM SOPs, Scholarship essays"). Each entry is 1–4 words, title case.',
          'Source discipline:',
          '- Only suggest subjects the context supports. If the seller lists "MBA admissions" and no other signals, suggest "MBA admissions" — not "Tax preparation" or "Criminal defense".',
          'Return ONLY the comma-separated list.',
          '',
          'Context:',
          base,
        ].join('\n'),
      }
    case 'industries':
      return {
        format: 'string', hardLimit: 240,
        prompt: [
          `Suggest the industries / sectors this ${roleLabel} serves.`,
          'Format: 2–5 industries, comma-separated on a single line.',
          'These should be the sectors a buyer would scan a directory by (e.g. "Higher education, Tech startups, Non-profits"). Each entry is 1–3 words, title case.',
          'Source discipline:',
          '- Only suggest industries the context supports. If the seller mentions "tech" and no other signals, suggest "Tech" — not "Healthcare" or "Real estate".',
          'Return ONLY the comma-separated list.',
          '',
          'Context:',
          base,
        ].join('\n'),
      }
    case 'languages':
      return {
        format: 'list', hardLimit: 6,
        prompt: [
          'Suggest spoken languages this seller can advise in — ONLY pull from the context.',
          'If the context already lists languages, return them deduplicated. If languages is empty, return just "English" (most likely default for a US/UK/Canada seller).',
          'Format: each language is 1–2 words (e.g. "English", "Spanish", "Mandarin Chinese"). Title case. Comma-separated on a single line.',
          'NEVER invent a language the seller didn\'t mention.',
          'Return ONLY the comma-separated list.',
          '',
          'Context:',
          base,
        ].join('\n'),
      }
  }
}

function cleanString(raw: string): string {
  let s = raw.trim()
  s = s.replace(/^\s*(?:tagline|intro|bio|byline|about)\s*:\s*/i, '')
  s = s.replace(/^["'`]+|["'`]+$/g, '').trim()
  return s
}

function parseList(raw: string, maxItems: number): string[] {
  return raw
    .split(/[,\n]+/g)
    .map((t) => t.trim().replace(/^["'`#]+|["'`]+$/g, ''))
    .filter((t) => t.length > 0 && t.length <= 48)
    .slice(0, maxItems)
}

const SYSTEM_PROMPT = [
  'You are a profile-copy assistant for a professional-services marketplace.',
  'You help attorneys and consultants write the prose on their public seller profile — tagline, intro, bio, specialties, practice areas, subjects, and industries.',
  'You ONLY work with facts already in the user message context. You NEVER invent: bar numbers, registration numbers, license IDs, malpractice policy numbers, specific case counts, jurisdictions the seller isn\'t admitted in, languages the seller hasn\'t listed, or years of experience that weren\'t provided.',
  'You NEVER promise outcomes (no "guaranteed", "100% approval", "always win"). You write professional, concrete, buyer-facing copy.',
  'You match the seller\'s voice if a tone signal exists in their existing tagline/intro/bio; otherwise default to first-person, plain, professional language.',
  'Output ONLY the requested text — no markdown headers, no labels, no preamble.',
].join(' ')

export async function draftProfileField(
  field: ProfileField,
  context: ProfileContext,
  hint?: string,
): Promise<ProfileSuggestResult> {
  if (!ALLOWED_PROFILE_FIELDS.includes(field)) {
    return { ok: false, status: 400, message: `Field "${field}" is not AI-editable.` }
  }
  const provider = getChatProvider()
  if (!provider) {
    return {
      ok: false, status: 503,
      message: 'AI assistant is not configured. Add GROQ_API_KEY or GEMINI_API_KEY to enable suggestions.',
    }
  }
  const spec = buildFieldSpec(field, context)
  const trimmedHint = (hint || '').trim().slice(0, 400)
  // Regeneration support — see lib/seoSuggest for the same pattern. When the
  // caller sends the previous draft, we instruct the model to produce a
  // DISTINCT alternative (different angle/opening/word choices). Plus a
  // per-call style cue that varies seeds so two identical requests don't
  // return the same bytes at temperature 0.4.
  const previousValue = context.previousValue
  const previousBlock = typeof previousValue === 'string' && previousValue.trim()
    ? [
        '',
        '## Previous draft (do NOT repeat)',
        previousValue.trim().slice(0, 1500),
        '',
        'Produce a DISTINCT alternative. Vary the opening sentence/structure, the angle, and the word choices. The new draft must read as a meaningfully different option — not a paraphrase.',
      ].join('\n')
    : ''
  const STYLE_CUES = [
    'lead with the buyer-facing outcome, not the seller',
    'open with a specific document, deadline, or proof point',
    'open with the audience this is for',
    'lead with credentials or evidence of experience',
    'open with a concrete result this seller has delivered',
  ]
  const styleCue = STYLE_CUES[Math.floor(Math.random() * STYLE_CUES.length)]
  const userMessage = [
    `## Style cue for this draft\nFor this specific draft, ${styleCue}.`,
    '',
    '## Task',
    spec.prompt,
    trimmedHint ? `\nAdditional guidance from the seller: ${trimmedHint}` : '',
    previousBlock,
  ].filter(Boolean).join('\n')

  let raw: string
  try {
    raw = await provider.reply(SYSTEM_PROMPT, [{ role: 'user', content: userMessage }])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, message: `AI suggestion failed: ${msg}` }
  }

  if (spec.format === 'list') {
    const items = parseList(raw, spec.hardLimit ?? 8)
    if (!items.length) {
      return { ok: false, status: 502, message: 'Model returned no usable items. Try again.' }
    }
    return { ok: true, value: items }
  }

  const cleaned = cleanString(raw)
  if (!cleaned) return { ok: false, status: 502, message: 'Model returned empty output. Try again.' }
  const limited = spec.hardLimit && cleaned.length > spec.hardLimit
    ? cleaned.slice(0, spec.hardLimit).replace(/\s+\S*$/, '')
    : cleaned
  return { ok: true, value: limited }
}
