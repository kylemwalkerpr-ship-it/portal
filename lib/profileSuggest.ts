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
  | 'languages'

export const ALLOWED_PROFILE_FIELDS: ProfileField[] = [
  'tagline', 'intro', 'bio', 'specialties', 'practice_areas', 'languages',
]

export type ProfileRole = 'attorney' | 'consultant'

export interface ProfileContext {
  role: ProfileRole
  full_name?: string | null
  credential_type?: string | null
  years_experience?: number | null
  jurisdictions?: string | null
  practice_areas?: string | null
  specialties?: string[] | null
  languages?: string[] | null
  education?: string | null
  tagline?: string | null
  intro?: string | null
  bio?: string | null
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
  lines.push(`Role: ${ctx.role === 'attorney' ? 'Licensed attorney' : 'Immigration / legal consultant'}`)
  if (ctx.full_name) lines.push(`Display name: ${ctx.full_name}`)
  if (ctx.credential_type) lines.push(`Credential: ${ctx.credential_type}`)
  if (typeof ctx.years_experience === 'number' && ctx.years_experience > 0) {
    lines.push(`Years of experience: ${ctx.years_experience}`)
  }
  if (ctx.jurisdictions) lines.push(`Jurisdictions admitted: ${ctx.jurisdictions}`)
  if (ctx.practice_areas) lines.push(`Practice areas: ${ctx.practice_areas}`)
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
          '- Lead with the buyer-facing outcome or specialty (e.g. "F-1 reinstatement specialist" or "UK spouse visa attorney"), not a generic title.',
          '- If the context lists years of experience or jurisdictions, you MAY mention them — do not invent any.',
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
          '- May reference the seller\'s years of experience or jurisdictions from the context — DO NOT invent any.',
          '- First person ("I help…", "I represent…") is fine and preferred when no contrary signal exists.',
          '- No outcome promises ("guaranteed", "100%"), no specific case counts unless they appear in the context.',
          '- No emoji, no quotation marks, no markdown.',
          'Return ONLY the intro prose.',
          '',
          'Context:',
          base,
        ].join('\n'),
      }
    case 'bio':
      return {
        format: 'string', hardLimit: 4000,
        prompt: [
          `Write a long-form bio (300–500 words) for a ${roleLabel}'s public profile.`,
          'Structure: 3 paragraphs, plain prose, no markdown headings or bullets.',
          '1) Opening paragraph: who they are and what kind of cases they take. Lead with the buyer-facing outcome.',
          '2) Middle paragraph: how they work — process, communication style, what to expect from an engagement.',
          '3) Closing paragraph: who they serve best, and (optionally) cases they\'re NOT the right fit for. Honest scoping helps qualified-lead quality.',
          'SEO discipline:',
          '- Include the seller\'s practice area keywords from the context naturally in paragraph 1.',
          '- If the context lists jurisdictions, name at least one in paragraph 1.',
          'Hard limits:',
          '- NEVER invent bar numbers, registration IDs, license numbers, malpractice insurance details, or specific case counts.',
          '- NEVER claim or imply guaranteed outcomes.',
          '- NEVER list jurisdictions the context doesn\'t mention.',
          '- First person preferred; no AI-assistant disclaimers.',
          'Return ONLY the bio prose.',
          '',
          'Context:',
          base,
        ].join('\n'),
      }
    case 'specialties':
      return {
        format: 'list', hardLimit: 8,
        prompt: [
          `Suggest 5–8 specialty tags for a ${roleLabel}'s public profile.`,
          'Tags are more granular than practice areas — they\'re the specific things this seller is best at.',
          'Format: each tag is 1–4 words, sentence-case or title-case (consistent across the set), no emoji, no punctuation other than spaces and hyphens.',
          'Source discipline:',
          '- Pull specialty ideas from the seller\'s practice_areas, jurisdictions, and existing prose in the context.',
          '- Do not invent specialties the context doesn\'t support. If practice_areas is "Immigration", reasonable tags include "F-1 reinstatement", "H-1B RFE response", "Asylum applications" — but not "Family law" or "Criminal defense".',
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
    case 'languages':
      return {
        format: 'list', hardLimit: 6,
        prompt: [
          'Suggest spoken languages this seller can advise in — ONLY pull from the context.',
          'If the context already lists languages, return them deduplicated. If languages is empty, return just "English" (most likely default for a US/UK/Canada legal-services seller).',
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
  'You are a profile-copy assistant for a legal-services marketplace.',
  'You help attorneys and consultants write the prose on their public seller profile — tagline, intro, bio, specialties, practice areas.',
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
  const userMessage = [
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
