/**
 * GET /api/admin/attorney-applications/[id]/risk
 *
 * Mirror of the consultant risk endpoint. See
 * app/api/admin/consultant-applications/[id]/risk/route.ts for the response
 * contract and flag-meta rationale — only the flag table differs (bar number
 * instead of registration number, practice areas instead of specialties).
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

const FLAG_META: Record<string, { label: string; weight: number }> = {
  no_bar_number:          { label: 'No bar / roll number',    weight: 25 },
  no_insurance:           { label: 'No insurance disclosed',  weight: 15 },
  free_email:             { label: 'Free-mail address',       weight: 10 },
  missing_jurisdictions:  { label: 'No jurisdictions',        weight: 15 },
  missing_practice_areas: { label: 'No practice areas',       weight: 10 },
  suspicious_profile_url: { label: 'Suspicious profile URL',  weight: 5 },
}

function recommendFor(score: number, flags: string[]): string {
  if (!flags.length && score === 0) return 'Routine review — no automated flags raised.'
  if (score >= 50) return 'High risk — request bar verification before approving.'
  if (score >= 25) return 'Elevated risk — verify bar / insurance details.'
  return 'Low risk — proceed with standard review.'
}

function bandFor(score: number, scored: boolean): 'low' | 'med' | 'high' | 'none' {
  if (!scored) return 'none'
  if (score >= 50) return 'high'
  if (score >= 25) return 'med'
  return 'low'
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth
  const { id } = await context.params

  const warnings: string[] = []
  let row: { risk_score: number | null; risk_flags: unknown } | null = null

  const primary = await db
    .from('attorney_applications')
    .select('risk_score, risk_flags')
    .eq('id', id)
    .maybeSingle()
  if (primary.error && /column .* does not exist/i.test(primary.error.message || '')) {
    warnings.push('risk_columns_missing')
  } else if (primary.error) {
    return fail(primary.error.message, 500)
  } else {
    row = primary.data as { risk_score: number | null; risk_flags: unknown } | null
  }

  if (!row) {
    return ok(
      {
        risk: {
          score: 0,
          band: 'none' as const,
          flags: [],
          drivers: [],
          recommendation: 'Not scored — no risk record available for this application.',
          scored: false,
        },
      },
      {},
      warnings.length ? { data_warnings: warnings } : {},
    )
  }

  const score = Math.max(0, Math.min(100, Number(row.risk_score || 0)))
  const flags: string[] = Array.isArray(row.risk_flags)
    ? (row.risk_flags as string[])
    : []

  const drivers = flags.map(f => ({
    flag: f,
    label: FLAG_META[f]?.label || f,
    weight: FLAG_META[f]?.weight ?? 0,
  }))

  const scored = flags.length > 0 || score > 0

  return ok(
    {
      risk: {
        score,
        band: bandFor(score, scored),
        flags,
        drivers,
        recommendation: recommendFor(score, flags),
        scored,
      },
    },
    {},
    warnings.length ? { data_warnings: warnings } : {},
  )
}
