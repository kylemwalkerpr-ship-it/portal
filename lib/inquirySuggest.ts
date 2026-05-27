// AI helper for the student inquiry intake form. Students often type
// rambling, half-organized descriptions of their situation. This lib's
// job is to take what they already wrote and reshape it into clear,
// attorney-readable prose — NOT to invent details they didn't provide.
//
// Safety contract (critical — this AI sees a real client's case facts):
//   - NEVER fabricate dates, document numbers, case numbers, names, or
//     events the student didn't mention.
//   - NEVER add legal conclusions or advice ("you should file Form X").
//   - NEVER promise outcomes or eligibility ("you qualify for asylum").
//   - If the student wrote one sentence, the polished version is still
//     one sentence (just clearer) — not a fabricated three-paragraph essay.
//   - Always preserve the student's facts verbatim; only rewrite phrasing,
//     structure, and grammar.

import { getChatProvider } from './chatProvider'

export type InquiryField = 'case_description' | 'notes'

export const ALLOWED_INQUIRY_FIELDS: InquiryField[] = ['case_description', 'notes']

export interface InquiryContext {
  country?: string | null
  case_type?: string | null
  question_label?: string | null
  question_help?: string | null
  draft: string
}

export type InquirySuggestSuccess = { ok: true; value: string }
export type InquirySuggestFailure = { ok: false; status: number; message: string }
export type InquirySuggestResult = InquirySuggestSuccess | InquirySuggestFailure

const SYSTEM_PROMPT = [
  'You are a writing assistant helping a person describe their legal/immigration situation to an attorney for the FIRST time.',
  'Your ONLY job is to take what the person already wrote and reshape it into clear, structured prose an attorney can quote on.',
  'You DO NOT invent facts. If a date, document, or detail wasn\'t in the draft, it stays out of the polished version.',
  'You DO NOT add legal advice, eligibility opinions, recommended forms, or outcome predictions.',
  'You preserve the person\'s tone — first person, plain language. Do not switch to third person.',
  'If the draft is shorter than a sentence (or empty), respond with a short note explaining you need more detail to polish — DO NOT fabricate a story.',
  'Output ONLY the polished text — no markdown, no labels, no preamble, no "Here is your polished draft" framing.',
].join(' ')

export async function polishInquiryField(
  field: InquiryField,
  context: InquiryContext,
  hint?: string,
): Promise<InquirySuggestResult> {
  if (!ALLOWED_INQUIRY_FIELDS.includes(field)) {
    return { ok: false, status: 400, message: `Field "${field}" is not AI-editable.` }
  }
  const draft = (context.draft || '').trim()
  if (draft.length < 10) {
    return {
      ok: false, status: 400,
      message: 'Type a few sentences about your situation first — the AI organizes what you wrote, it doesn\'t invent details.',
    }
  }
  const provider = getChatProvider()
  if (!provider) {
    return {
      ok: false, status: 503,
      message: 'AI assistant is not configured for this site yet.',
    }
  }

  const taskLines: string[] = []
  if (field === 'case_description') {
    taskLines.push(
      'Reshape the person\'s answer below into clear prose an attorney can read quickly.',
      'Keep the same length range as the original (give or take 25%). If the original is one paragraph, the polished version is one paragraph.',
      'Preserve every fact verbatim — dates, document codes (e.g. "I-20", "F-1"), names, places, prior counsel, deadlines.',
      'Fix grammar and flow. Break run-on sentences. Order events chronologically when possible.',
      'NEVER add: legal advice, document recommendations, eligibility statements, attorney qualifications, outcome predictions.',
    )
  } else {
    taskLines.push(
      'The person is adding optional notes for an attorney about anything that didn\'t fit the structured questions.',
      'Tighten what they wrote — preserve every fact, just make it clearer. Keep it short (max 3–4 sentences).',
      'NEVER add new facts or any legal opinions.',
    )
  }
  if (context.country) taskLines.push(`Jurisdiction: ${context.country}.`)
  if (context.case_type) taskLines.push(`Case type: ${context.case_type}.`)
  if (context.question_label) taskLines.push(`The question being answered is: "${context.question_label}".`)

  const userMessage = [
    '## Task',
    ...taskLines,
    '',
    '## The person\'s draft',
    draft,
    hint ? `\n## Additional guidance from the person\n${String(hint).slice(0, 400)}` : '',
  ].join('\n')

  let raw: string
  try {
    raw = await provider.reply(SYSTEM_PROMPT, [{ role: 'user', content: userMessage }])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, message: `AI polish failed: ${msg}` }
  }

  const cleaned = raw
    .trim()
    .replace(/^\s*(?:polished|polished draft|here is|here's)[^a-z0-9]*[:\-]\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
  if (!cleaned) return { ok: false, status: 502, message: 'Model returned empty output. Try again.' }
  // Hard cap — case descriptions don't need to balloon past 2000 chars.
  const capped = cleaned.length > 2000 ? cleaned.slice(0, 2000).replace(/\s+\S*$/, '') : cleaned
  return { ok: true, value: capped }
}
