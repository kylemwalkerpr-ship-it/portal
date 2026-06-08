/**
 * POST /api/templates/fill/suggest
 *
 * Uses the AI provider chain (Groq → Gemini → Cloudflare AI) to suggest
 * a value for a single template form field, grounded in the student's
 * profile data. Follows the same pattern as profileSuggest.ts.
 *
 * Body:
 *   { slug: string, fieldId: string, fieldLabel: string, currentValue: string, profileData: string }
 *
 * Returns:
 *   { ok: true, data: { suggestion: string } }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { getChatProvider } from '@/lib/chatProvider'

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body.', 400)
  }

  const fieldId = String(body.fieldId || '')
  const fieldLabel = String(body.fieldLabel || fieldId || '')
  const currentValue = String(body.currentValue || '')
  const fieldType = String(body.type || 'text')
  const profileRaw = body.profileData
  const profileData = typeof profileRaw === 'string' ? profileRaw : JSON.stringify(profileRaw || {}, null, 2)

  if (!fieldLabel) return fail('fieldId or fieldLabel is required.', 400)

  const provider = getChatProvider()
  if (!provider) {
    return ok({ suggestion: '' })
  }

  // ── Special mode: generate a full manifest JSON ──────────────────────
  if (fieldId === '__generate_manifest__') {
    const systemPrompt = [
      'You are a PDF form manifest generator for immigration document templates.',
      'Given a template name and any existing manifest context, produce a VALID JSON manifest.',
      'The manifest MUST be in this exact structure:',
      '{',
      '  "slug": "template-slug",',
      '  "pageSize": "LETTER",',
      '  "sections": [',
      '    {',
      '      "title": "Section Title",',
      '      "intro": "Optional description",',
      '      "fields": [',
      '        { "id": "field_id", "label": "Field Label", "type": "text", "required": false, "placeholder": "", "help": "" }',
      '      ]',
      '    }',
      '  ]',
      '}',
      'Valid field types: text, multiline, checkbox, date, select, signature.',
      'If an existing_manifest is provided in the context, ENHANCE it by adding more relevant fields.',
      'Include all fields that would be needed for this immigration document.',
      'Output ONLY the raw JSON — no markdown fences, no explanations.',
    ].join('\n')

    const userMessage = [
      '## Template context',
      profileData,
      '',
      'Generate a comprehensive fillable PDF manifest for this immigration template.',
      'Include ALL relevant fields a typical applicant would need to fill out.',
      'Return ONLY the raw JSON object.',
    ].join('\n')

    try {
      const raw = await provider.reply(systemPrompt, [{ role: 'user', content: userMessage }], { maxOutputTokens: 2000 })
      // Strip markdown fences if the AI wrapped it
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const jsonStart = cleaned.indexOf('{')
      const jsonEnd = cleaned.lastIndexOf('}')
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const manifestJson = cleaned.slice(jsonStart, jsonEnd + 1)
        return ok({ suggestion: manifestJson })
      }
      return ok({ suggestion: cleaned })
    } catch {
      return ok({ suggestion: '' })
    }
  }

  // ── Normal mode: single field value suggestion ───────────────────────
  const systemPrompt = [
    'You are a helpful assistant that suggests values for immigration document template fields.',
    'You ONLY use information already present in the student profile data below.',
    'You NEVER invent names, addresses, numbers, or personal details.',
    'If the profile data does not contain enough information to make a reasonable suggestion, return an empty string.',
    'Output ONLY the suggested value — no explanations, no labels, no quotes.',
  ].join(' ')

  const userMessage = [
    '## Student profile data',
    profileData || 'No profile data available.',
    '',
    `## Field to suggest a value for`,
    `Label: "${fieldLabel}"`,
    currentValue ? `Current value: "${currentValue}" (only suggest if it seems empty or placeholder-like)` : 'Current value: (empty)',
    '',
    'Suggest a reasonable, factual value for this field based on the profile data above.',
    'If the field asks for something not in the profile data, return only: EMPTY',
    'Otherwise return ONLY the suggested value text.',
  ].join('\n')

  try {
    const raw = await provider.reply(systemPrompt, [{ role: 'user', content: userMessage }])
    const suggestion = raw.replace(/^['"]|['"]$/g, '').trim()
    if (!suggestion || suggestion === 'EMPTY') {
      return ok({ suggestion: '' })
    }
    return ok({ suggestion })
  } catch {
    return ok({ suggestion: '' })
  }
}
