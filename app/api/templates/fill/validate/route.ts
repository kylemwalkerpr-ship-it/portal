/**
 * POST /api/templates/fill/validate
 *
 * AI consistency check: reviews the values a student has entered across a
 * template's fields and flags cross-field inconsistencies BEFORE they pay /
 * download — e.g. dates that don't line up, a name spelled differently in two
 * places, a "currently employed" box that contradicts an end date. A trust /
 * quality layer; it never rewrites the student's answers, only flags.
 *
 * Body:  { slug: string, values: Record<string, string|boolean> }
 * Returns: { ok: true, data: { issues: Array<{ fields: string[]; severity: 'warning'|'info'; message: string }> } }
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { getChatProvider } from '@/lib/chatProvider'
import { getManifest } from '@/lib/templatePdfManifests'

function parseJsonArray(raw: string): any[] {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
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

  // Label map so the AI (and the returned messages) reference human labels.
  const labelById = new Map<string, string>()
  for (const section of manifest.sections ?? []) {
    for (const f of (section as any).fields ?? []) {
      if (f?.id) labelById.set(f.id, f.label || f.id)
    }
  }

  // Only review fields that actually have a value.
  const filled = Object.entries(values).filter(([, v]) => {
    if (typeof v === 'string') return v.trim() !== ''
    return v !== undefined && v !== null
  })

  if (filled.length < 2) {
    return ok({ issues: [] })
  }

  const provider = getChatProvider()
  if (!provider) return ok({ issues: [] })

  const systemPrompt = [
    'You review immigration-document form answers for internal consistency.',
    'Flag ONLY genuine cross-field problems: contradictory dates, a date order that is impossible,',
    'a name/address spelled differently in two fields, a yes/no box that contradicts another answer,',
    'or a clearly malformed value (e.g. an email with no @).',
    'Do NOT flag missing/empty fields, and do NOT invent rules. If everything is consistent, return [].',
    'Return ONLY a JSON array. Each item: {"fields":["field_id",...],"severity":"warning"|"info","message":"short human explanation"}.',
    'No prose, no code fences.',
  ].join('\n')

  const answerLines = filled.map(([id, v]) => `- ${id} ("${labelById.get(id) || id}"): ${String(v)}`)
  const userMessage = ['## Answers to review', answerLines.join('\n')].join('\n')

  try {
    const raw = await provider.reply(systemPrompt, [{ role: 'user', content: userMessage }], { maxOutputTokens: 1200 })
    const parsed = parseJsonArray(raw)
    const issues = parsed
      .filter((it) => it && typeof it.message === 'string' && it.message.trim())
      .slice(0, 25)
      .map((it) => ({
        fields: Array.isArray(it.fields) ? it.fields.filter((f: unknown) => typeof f === 'string') : [],
        severity: it.severity === 'info' ? 'info' : 'warning',
        message: String(it.message).trim(),
      }))
    return ok({ issues })
  } catch {
    return ok({ issues: [] })
  }
}
