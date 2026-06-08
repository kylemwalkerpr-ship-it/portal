/**
 * POST /api/templates/fill/autofill
 *
 * One-click AI auto-fill: given a template slug and the student's profile +
 * any values already entered, suggests values for EVERY still-empty field in
 * one request. Builds on the same free AI provider chain (Groq → Gemini →
 * Cloudflare → OpenRouter) as fill/suggest, but batched so the student doesn't
 * have to click each field.
 *
 * Grounding rule: only fill fields that can be reasonably derived from the
 * profile/known values. Never invent passport numbers, dates, addresses, or
 * other personal identifiers that aren't present — leave those for the student.
 *
 * Body:  { slug: string, values?: Record<string, string|boolean>, profileData?: string }
 * Returns: { ok: true, data: { suggestions: Record<string, string|boolean>, filledCount: number } }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { getChatProvider } from '@/lib/chatProvider'
import { getManifest } from '@/lib/templatePdfManifests'

type ManifestField = {
  id: string
  label?: string
  type?: string
  options?: Array<string | { value?: string; label?: string }>
  help?: string
}

const BATCH_SIZE = 24

function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim() === ''
  if (typeof v === 'boolean') return false
  return false
}

function fieldOptions(f: ManifestField): string[] {
  if (!Array.isArray(f.options)) return []
  return f.options.map((o) => (typeof o === 'string' ? o : String(o.value ?? o.label ?? ''))).filter(Boolean)
}

function parseJsonObject(raw: string): Record<string, unknown> {
  // Strip code fences / prose and isolate the first {...} block.
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return {}
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1))
    return obj && typeof obj === 'object' ? (obj as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return fail('Invalid JSON body.', 400)
  }

  const slug = String(body.slug || '')
  if (!slug) return fail('slug is required.', 400)

  const manifest = getManifest(slug)
  if (!manifest) return fail('No fillable form manifest for this template.', 404)

  const values = (body.values && typeof body.values === 'object' ? body.values : {}) as Record<string, unknown>
  const profileRaw = body.profileData
  const profileData = typeof profileRaw === 'string' ? profileRaw : JSON.stringify(profileRaw || {}, null, 2)

  // Flatten every field from the manifest (server-side — never trust client field defs).
  const allFields: ManifestField[] = []
  for (const section of manifest.sections ?? []) {
    for (const f of (section as any).fields ?? []) allFields.push(f as ManifestField)
  }
  const emptyFields = allFields.filter((f) => f?.id && isEmptyValue(values[f.id]))

  if (emptyFields.length === 0) {
    return ok({ suggestions: {}, filledCount: 0 })
  }

  const provider = getChatProvider()
  if (!provider) return ok({ suggestions: {}, filledCount: 0 })

  const systemPrompt = [
    'You auto-fill immigration document form fields from a student profile.',
    'STRICT RULES:',
    '1. Only fill a field when its value is clearly derivable from the profile or already-entered values.',
    '2. NEVER invent personal identifiers — passport numbers, visa numbers, exact dates, street addresses, SINs/SSNs, employer names — that are not present. Omit those fields.',
    '3. For checkbox fields return a boolean (true/false). For choice fields return EXACTLY one of the provided options.',
    '4. Return ONLY a JSON object mapping field id → value. Omit any field you cannot fill. No prose, no code fences.',
  ].join('\n')

  const suggestions: Record<string, string | boolean> = {}

  // Batch so a 95-field template doesn't blow the output-token ceiling.
  for (let i = 0; i < emptyFields.length; i += BATCH_SIZE) {
    const batch = emptyFields.slice(i, i + BATCH_SIZE)
    const fieldLines = batch.map((f) => {
      const opts = fieldOptions(f)
      const meta = [
        `type=${f.type || 'text'}`,
        opts.length ? `options=[${opts.join(' | ')}]` : '',
        f.help ? `help="${f.help}"` : '',
      ]
        .filter(Boolean)
        .join(', ')
      return `- ${f.id}: "${f.label || f.id}"${meta ? ` (${meta})` : ''}`
    })

    const userMessage = [
      '## Student profile',
      profileData || 'No profile data available.',
      '',
      '## Already-entered values (for context)',
      Object.keys(values).length ? JSON.stringify(values) : '(none yet)',
      '',
      '## Fields to fill (return JSON id → value, omit any you cannot derive)',
      fieldLines.join('\n'),
    ].join('\n')

    try {
      const raw = await provider.reply(systemPrompt, [{ role: 'user', content: userMessage }], { maxOutputTokens: 1500 })
      const parsed = parseJsonObject(raw)
      const allowed = new Set(batch.map((f) => f.id))
      const typeById = new Map(batch.map((f) => [f.id, (f.type || 'text').toLowerCase()]))
      for (const [k, v] of Object.entries(parsed)) {
        if (!allowed.has(k) || v === null || v === undefined) continue
        const t = typeById.get(k)
        if (t === 'checkbox' || t === 'boolean') {
          suggestions[k] = v === true || String(v).toLowerCase() === 'true'
        } else {
          const str = String(v).trim()
          if (str && str.toUpperCase() !== 'EMPTY') suggestions[k] = str
        }
      }
    } catch {
      // Skip this batch; partial auto-fill is still useful.
    }
  }

  return ok({ suggestions, filledCount: Object.keys(suggestions).length })
}
